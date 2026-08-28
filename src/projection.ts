import sharp from 'sharp';

/** Generate a compass (SVG) rotated to the given heading, as a PNG buffer. */
export async function compassImage(heading: number, size = 140): Promise<Buffer> {
  const s = size;
  const c = s / 2;
  const r = s * 0.42;
  const tip = r * 0.86; // needle tip distance from center
  const w = r * 0.2; // half-width of a needle at its base
  // Heading is degrees clockwise from north (0=N, 90=E). The red (north) needle starts
  // pointing up; rotating the group by `heading` turns it to face the direction of travel.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="rgba(20,20,20,0.72)" stroke="rgba(255,255,255,0.85)" stroke-width="${Math.max(2, s * 0.03)}"/>
    <g transform="rotate(${(360 - (heading % 360)) % 360} ${c} ${c})">
      <polygon points="${c},${c - tip} ${c - w},${c} ${c + w},${c}" fill="#e74c3c"/>
      <polygon points="${c},${c + tip} ${c - w},${c} ${c + w},${c}" fill="#ecf0f1"/>
    </g>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Composite a compass (rotated to `heading`) onto the bottom-left of the view. */
export async function addCompass(view: Buffer, heading: number): Promise<Buffer> {
  const meta = await sharp(view).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const size = Math.max(90, Math.round(Math.min(W, H) * 0.16));
  const compass = await compassImage(heading, size);
  const pad = Math.round(size * 0.3);
  return sharp(view)
    .composite([{ input: compass, left: pad, top: H - size - pad }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

export interface ViewOptions {
  /** Camera heading in degrees (0 = center of the equirectangular image). */
  heading: number;
  /** Camera pitch in degrees (negative looks down toward the road). */
  pitch: number;
  /** Horizontal field of view in degrees. */
  fov: number;
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
}

export const DEFAULT_VIEW: ViewOptions = { heading: 0, pitch: 0, fov: 120, width: 2560, height: 1440 };

/** Base horizontal FOV that GeoGuessr's zoom factor applies to (approximates the in-game viewport). */
export const BASE_FOV = 120;

/** Convert GeoGuessr's zoom factor to a horizontal FOV in degrees. */
export function fovFromZoom(zoom: number, baseFov = BASE_FOV): number {
  return baseFov * Math.pow(0.9, zoom);
}

/** Normalize a heading to [-180, 180). */
export function normalizeHeading(heading: number): number {
  return ((heading % 360) + 540) % 360 - 180;
}

/**
 * Extract a perspective-corrected view from an equirectangular panorama buffer.
 * Handles horizontal wraparound by widening the source when the view crosses the seam.
 */
export async function extractView(pano: Buffer, opts: ViewOptions): Promise<Buffer> {
  const meta = await sharp(pano).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (!W || !H) throw new Error('invalid panorama');

  const degToRad = Math.PI / 180;
  const fovRad = opts.fov * degToRad;

  const f = (opts.width / 2) / Math.tan(fovRad / 2);
  const pitchRad = opts.pitch * degToRad;

  const { data: src, info } = await sharp(pano).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const srcW = info.width;
  const srcH = info.height;

  const out = Buffer.alloc(opts.width * opts.height * 3);

  for (let y = 0; y < opts.height; y++) {
    const v = (opts.height / 2 - y);
    for (let x = 0; x < opts.width; x++) {
      const u = (x - opts.width / 2);

      // Ray direction in camera space (yaw applied implicitly by sampling longitude offset).
      const yaw = Math.atan2(u, f);
      const dist = Math.sqrt(u * u + f * f);
      const pitchRay = Math.atan2(v, dist) + pitchRad;

      const lon = normalizeHeading(opts.heading) * degToRad + yaw;
      const lat = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchRay));

      // Equirectangular sample coordinates.
      const sx = (((lon / (2 * Math.PI)) + 0.5) * srcW + srcW) % srcW;
      const sy = Math.max(0, Math.min(srcH - 1, (0.5 - lat / Math.PI) * srcH));

      // Bilinear sample for a sharper result when zoomed.
      const x0 = Math.floor(sx - 0.5);
      const y0 = Math.floor(sy - 0.5);
      const fx = sx - 0.5 - x0;
      const fy = sy - 0.5 - y0;
      const xa = ((x0 % srcW) + srcW) % srcW;
      const xb = (xa + 1) % srcW;
      const ya = Math.max(0, Math.min(srcH - 1, y0));
      const yb = Math.max(0, Math.min(srcH - 1, y0 + 1));

      const dOff = (y * opts.width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const top = src[(ya * srcW + xa) * channels + c] * (1 - fx) + src[(ya * srcW + xb) * channels + c] * fx;
        const bot = src[(yb * srcW + xa) * channels + c] * (1 - fx) + src[(yb * srcW + xb) * channels + c] * fx;
        out[dOff + c] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  }

  return sharp(out, { raw: { width: opts.width, height: opts.height, channels: 3 } })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Average pixel brightness (0-255) of an image buffer. */
export async function averageBrightness(image: Buffer): Promise<number> {
  const { data } = await sharp(image).greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (const v of data) sum += v;
  return data.length > 0 ? sum / data.length : 0;
}

export interface RoundCamera {
  /** The map-authored camera heading (absolute, degrees). */
  heading: number;
  pitch: number;
  zoom: number;
  /** True for photospheres (pano id starts with "P-") where heading may be baked to 0. */
  photosphere: boolean;
  /** True when photometa resolved (official coverage). */
  official: boolean;
  /** The direction the camera car was driving (degrees), from Google's metadata. */
  drivingDirection: number | null;
}

/**
 * Heading candidates to try, best first. Mirrors the reference bots: render with
 * `(mapHeading - drivingDirection) % 360` so the view faces the actual road. When there is
 * no driving direction (photosphere), fall back to the brightness heuristic.
 */
export function headingCandidates(camera: RoundCamera, guessed: number): number[] {
  if (camera.drivingDirection !== null) {
    return [normalizeHeading(camera.heading - camera.drivingDirection)];
  }
  if (camera.photosphere && camera.heading === 0) return [guessed, 0, 90, 180, 270];
  return [camera.heading];
}

/**
 * Render the round viewport from a stitched panorama, aiming at the road using the
 * driving direction when available. Falls back through heading candidates if the result
 * looks into a black void, returning the brightest attempt as a last resort.
 */
export async function renderRoundView(pano: Buffer, camera: RoundCamera): Promise<Buffer> {
  const guessed = camera.photosphere && camera.heading === 0 ? await guessHeading(pano) : camera.heading;
  const headings = headingCandidates(camera, guessed);

  // Don't upscale beyond the source pano's width — that causes blur.
  const meta = await sharp(pano).metadata();
  const scale = meta.width && meta.width < DEFAULT_VIEW.width ? meta.width / DEFAULT_VIEW.width : 1;
  const width = Math.round(DEFAULT_VIEW.width * scale);
  const height = Math.round(DEFAULT_VIEW.height * scale);

  const panoBrightness = await averageBrightness(pano);
  // A view counts as valid when it is not dramatically darker than the pano itself.
  const threshold = Math.max(8, panoBrightness * 0.25);

  // Compass convention (matches the reference bots): driving direction when present
  // (official coverage), else the map's authored heading. Always shown.
  const compassHeading = camera.drivingDirection ?? camera.heading;

  let best: Buffer | null = null;
  let bestBrightness = -1;
  for (const heading of headings) {
    const view = await extractView(pano, {
      ...DEFAULT_VIEW,
      width,
      height,
      heading,
      pitch: camera.pitch,
      fov: fovFromZoom(camera.zoom),
    });
    const b = await averageBrightness(view);
    if (b > bestBrightness) {
      best = view;
      bestBrightness = b;
    }
    if (b >= threshold) {
      return addCompass(view, compassHeading);
    }
  }
  return addCompass(best!, compassHeading);
}

/**
 * Heuristic for photospheres without heading metadata: pick the heading whose horizontal
 * band is brightest (roads/sky are bright; dark walls/dense foliage usually are not).
 */
export async function guessHeading(pano: Buffer): Promise<number> {
  const small = await sharp(pano).resize(72, 36, { fit: 'fill' }).greyscale().raw().toBuffer();
  const bandTop = 14; // horizon-ish rows of a 36px-tall sphere
  const bandBottom = 24;
  let best = 0;
  let bestScore = -1;
  for (let col = 0; col < 72; col++) {
    let score = 0;
    for (let dx = 0; dx < 12; dx++) {
      const c = (col + dx) % 72;
      for (let row = bandTop; row < bandBottom; row++) score += small[row * 72 + c];
    }
    if (score > bestScore) {
      bestScore = score;
      best = col;
    }
  }
  // Center of the winning 60° window → degrees.
  return ((best + 6) / 72) * 360 - 180;
}
