import sharp from 'sharp';

interface PanoMeta {
  fullWidth: number;
  fullHeight: number;
  tileSize: number;
  /** The direction the camera car was driving (degrees) — the true road heading. */
  drivingDirection: number | null;
  /** Explicit render grid (used by the probe fallback where dimensions are approximate). */
  grid?: { zoom: number; cols: number; rows: number };
}

export interface PanoResult {
  image: Buffer;
  /** True when photometa resolved (official coverage); false for unofficial/trekker spheres. */
  official: boolean;
  /** For probed panos: the stitched image is a plain tile grid (not a 2:1 sphere). */
  grid: boolean;
  /** The direction the camera car was driving (degrees), when known. */
  drivingDirection: number | null;
}

const TILE_SIZE_FALLBACK = 512;
/** Target zoom level is this many levels below the max zoom (half resolution). */
const ZOOM_STEP_DOWN = 1;
const MAX_OUTPUT_WIDTH = 4096;

/**
 * Fetch panorama metadata (dimensions + driving direction) from Google's internal
 * MapsJsInternalService/GetMetadata RPC — the same endpoint the reference bots use.
 * Works for both official and user-contributed coverage.
 */
async function fetchMeta(panoId: string, fetchFn: typeof fetch): Promise<PanoMeta | null> {
  try {
    const res = await fetchFn(
      'https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/GetMetadata',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json+protobuf' },
        body: JSON.stringify([
          ['apiv3', null, null, null, 'US', null, null, null, null, null, [[0]]],
          ['en', 'US'],
          [[[2, panoId]]],
          [[1, 2, 3, 4, 8, 6]],
        ]),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;

    const dims = data?.[1]?.[0]?.[2]?.[3]?.[0]?.[4]?.[0]; // [height, width]
    const fullHeight = dims?.[0];
    const fullWidth = dims?.[1];
    if (!fullWidth || !fullHeight) return null;

    const drivingDirection = data?.[1]?.[0]?.[5]?.[0]?.[1]?.[2]?.[0] ?? null; // degrees
    return { fullWidth, fullHeight, tileSize: TILE_SIZE_FALLBACK, drivingDirection };
  } catch {
    return null;
  }
}

function tileUrl(panoId: string, x: number, y: number, zoom: number): string {
  return (
    `https://streetviewpixels-pa.googleapis.com/v1/tile?cb_client=apiv3` +
    `&panoid=${encodeURIComponent(panoId)}&output=tile&x=${x}&y=${y}&zoom=${zoom}&nbt=1&fover=2`
  );
}

/**
 * Resolve the nearest Street View pano id for a lat/lng via Google's SingleImageSearch RPC.
 * Used for maps (e.g. AI Generated World) that return coordinates without a panoId.
 */
export async function resolvePanoId(lat: number, lng: number, fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const payload =
      `[["apiv3"],[[null,null,${lat},${lng}],50],` +
      `[[null,null,null,null,null,null,null,null,null,null,[null,null]],null,null,null,null,null,null,null,[1],null,[[[2,true,2]]]],[[2,6]]]`;
    const res = await fetchFn(
      'https://maps.googleapis.com/$rpc/google.internal.maps.mapsjs.v1.MapsJsInternalService/SingleImageSearch',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json+protobuf' },
        body: payload,
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return data?.[1]?.[1]?.[1] ?? null;
  } catch {
    return null;
  }
}

async function tileExists(panoId: string, x: number, y: number, zoom: number, fetchFn: typeof fetch): Promise<boolean> {
  try {
    const res = await fetchFn(tileUrl(panoId, x, y, zoom), { signal: AbortSignal.timeout(10_000) });
    await res.arrayBuffer().catch(() => {}); // drain
    return res.ok;
  } catch {
    return false;
  }
}

/** Highest valid tile index on an axis via binary search (validity is monotonic). */
async function maxValidIndex(
  panoId: string,
  axis: 'x' | 'y',
  zoom: number,
  upperBound: number,
  fetchFn: typeof fetch,
): Promise<number> {
  let lo = 0;
  let hi = upperBound;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const ok = axis === 'x' ? await tileExists(panoId, mid, 0, zoom, fetchFn) : await tileExists(panoId, 0, mid, zoom, fetchFn);
    if (ok) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Fallback for photospheres (pano ids like "P-...") where photometa 400s but tiles work.
 * The nominal 2:1 size overshoots by up to one tile, so the render grid bounds are
 * probed explicitly at the target zoom.
 */
async function probeMeta(panoId: string, fetchFn: typeof fetch): Promise<PanoMeta | null> {
  for (let maxZoom = 5; maxZoom >= 0; maxZoom--) {
    if (!(await tileExists(panoId, 0, 0, maxZoom, fetchFn))) continue;

    const zoom = Math.max(0, maxZoom - ZOOM_STEP_DOWN);
    const cols = (await maxValidIndex(panoId, 'x', zoom, 2 ** zoom - 1, fetchFn)) + 1;
    const rows = (await maxValidIndex(panoId, 'y', zoom, 2 ** zoom - 1, fetchFn)) + 1;
    return {
      fullWidth: cols * TILE_SIZE_FALLBACK,
      fullHeight: rows * TILE_SIZE_FALLBACK,
      tileSize: TILE_SIZE_FALLBACK,
      drivingDirection: null,
      grid: { zoom, cols, rows },
    };
  }
  return null;
}

/**
 * Download and stitch a Street View panorama for the given pano id.
 * Renders at reduced zoom (max ~2048px wide) and returns a JPEG buffer.
 * Returns null when the panorama cannot be fetched.
 */
export async function fetchPanorama(panoId: string, fetchFn: typeof fetch = fetch): Promise<PanoResult | null> {
  const fromMeta = await fetchMeta(panoId, fetchFn);
  const official = fromMeta !== null;
  const meta = fromMeta ?? (await probeMeta(panoId, fetchFn));
  if (!meta) {
    console.warn(`[pano] ${panoId}: metadata failed on all endpoints`);
    return null;
  }

  const { fullWidth, fullHeight, tileSize } = meta;

  let zoom: number;
  let width: number;
  let height: number;
  let cols: number;
  let rows: number;
  if (meta.grid) {
    // Probed grid: bounds are known exactly.
    ({ zoom, cols, rows } = meta.grid);
    width = cols * tileSize;
    height = rows * tileSize;
  } else {
    const maxZoom = Math.max(0, Math.ceil(Math.log2(fullWidth / tileSize)));
    zoom = Math.max(0, maxZoom - ZOOM_STEP_DOWN);
    const scale = 2 ** (maxZoom - zoom);
    width = Math.ceil(fullWidth / scale);
    height = Math.ceil(fullHeight / scale);
    cols = Math.ceil(width / tileSize);
    rows = Math.ceil(height / tileSize);
  }

  const tileJobs: { url: string; left: number; top: number }[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      tileJobs.push({ url: tileUrl(panoId, x, y, zoom), left: x * tileSize, top: y * tileSize });
    }
  }

  // Tolerate individual tile failures (the tile area stays black).
  const fetched = await Promise.all(
    tileJobs.map(async ({ url, left, top }) => {
      try {
        const res = await fetchFn(url, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) return null;
        const input = Buffer.from(await res.arrayBuffer());
        return { input, left, top };
      } catch {
        return null;
      }
    }),
  );
  const tiles = fetched.filter((t): t is NonNullable<typeof t> => t !== null);
  if (tiles.length === 0) {
    console.warn(`[pano] ${panoId}: 0/${tileJobs.length} tiles fetched (grid ${cols}x${rows} @ zoom ${zoom})`);
    return null;
  }
  if (tiles.length < tileJobs.length) {
    console.warn(`[pano] ${panoId}: only ${tiles.length}/${tileJobs.length} tiles fetched (grid ${cols}x${rows} @ zoom ${zoom})`);
  }

  let image = sharp({
    create: {
      width: cols * tileSize,
      height: rows * tileSize,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  }).composite(tiles);

  // Crop to the real image bounds (last tiles can be partially blank).
  image = image.extract({ left: 0, top: 0, width: Math.min(width, cols * tileSize), height: Math.min(height, rows * tileSize) });

  const finalWidth = Math.min(width, cols * tileSize);
  if (finalWidth > MAX_OUTPUT_WIDTH) {
    image = image.resize({ width: MAX_OUTPUT_WIDTH });
  }

  const out = await image.jpeg({ quality: 88 }).toBuffer();
  return { image: out, official, grid: meta.grid !== undefined, drivingDirection: meta.drivingDirection };
}
