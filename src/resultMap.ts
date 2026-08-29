import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { feature } from 'topojson-client';
import { geoMercator, geoPath } from 'd3-geo';
import sharp from 'sharp';
import { normalizeSubdivisionCode, resolveSubdivision } from './data/subdivisions.js';

const WIDTH = 600;
const HEIGHT = 340;
const TILE_SIZE = 256;
const CACHE_DIR = join(process.cwd(), 'data', 'map-cache');
const memoryCache = new Map<string, any>();
// Arial/Helvetica aren't installed on typical Linux hosts, which makes librsvg render tofu boxes;
// these fonts ship with common Linux font packages (fonts-dejavu-core, fonts-liberation, fonts-noto-core).
const MAP_FONT = "'DejaVu Sans', 'Liberation Sans', 'Noto Sans', sans-serif";

// Alpha-2 to Alpha-3 mapping for geoBoundaries
const ALPHA2_TO_ALPHA3: Record<string, string> = {
  AD: 'AND', AE: 'ARE', AF: 'AFG', AG: 'ATG', AL: 'ALB', AM: 'ARM', AO: 'AGO', AR: 'ARG',
  AT: 'AUT', AU: 'AUS', AZ: 'AZE', BA: 'BIH', BB: 'BRB', BD: 'BGD', BE: 'BEL', BF: 'BFA',
  BG: 'BGR', BH: 'BHR', BI: 'BDI', BJ: 'BEN', BN: 'BRN', BO: 'BOL', BR: 'BRA', BS: 'BHS',
  BT: 'BTN', BW: 'BWA', BY: 'BLR', BZ: 'BLZ', CA: 'CAN', CD: 'COD', CF: 'CAF', CG: 'COG',
  CH: 'CHE', CI: 'CIV', CL: 'CHL', CM: 'CMR', CN: 'CHN', CO: 'COL', CR: 'CRI', CU: 'CUB',
  CV: 'CPV', CY: 'CYP', CZ: 'CZE', DE: 'DEU', DJ: 'DJI', DK: 'DNK', DM: 'DMA', DO: 'DOM',
  DZ: 'DZA', EC: 'ECU', EE: 'EST', EG: 'EGY', ER: 'ERI', ES: 'ESP', ET: 'ETH', FI: 'FIN',
  FJ: 'FJI', FM: 'FSM', FR: 'FRA', GA: 'GAB', GB: 'GBR', GD: 'GRD', GE: 'GEO', GH: 'GHA',
  GM: 'GMB', GN: 'GIN', GQ: 'GNQ', GR: 'GRC', GT: 'GTM', GW: 'GNB', GY: 'GUY', HN: 'HND',
  HR: 'HRV', HT: 'HTI', HU: 'HUN', ID: 'IDN', IE: 'IRL', IL: 'ISR', IN: 'IND', IQ: 'IRQ',
  IR: 'IRN', IS: 'ISL', IT: 'ITA', JM: 'JAM', JO: 'JOR', JP: 'JPN', KE: 'KEN', KG: 'KGZ',
  KH: 'KHM', KI: 'KIR', KM: 'COM', KN: 'KNA', KP: 'PRK', KR: 'KOR', KW: 'KWT', KZ: 'KAZ',
  LA: 'LAO', LB: 'LBN', LC: 'LCA', LI: 'LIE', LK: 'LKA', LR: 'LBR', LS: 'LSO', LT: 'LTU',
  LU: 'LUX', LV: 'LVA', LY: 'LBY', MA: 'MAR', MC: 'MCO', MD: 'MDA', ME: 'MNE', MG: 'MDG',
  MH: 'MHL', MK: 'MKD', ML: 'MLI', MM: 'MMR', MN: 'MNG', MR: 'MRT', MT: 'MLT', MU: 'MUS',
  MV: 'MDV', MW: 'MWI', MX: 'MEX', MY: 'MYS', MZ: 'MOZ', NA: 'NAM', NE: 'NER', NG: 'NGA',
  NI: 'NIC', NL: 'NLD', NO: 'NOR', NP: 'NPL', NR: 'NRU', NZ: 'NZL', OM: 'OMN', PA: 'PAN',
  PE: 'PER', PG: 'PNG', PH: 'PHL', PK: 'PAK', PL: 'POL', PR: 'PRI', PS: 'PSE', PT: 'PRT',
  PW: 'PLW', PY: 'PRY', QA: 'QAT', RO: 'ROU', RS: 'SRB', RU: 'RUS', RW: 'RWA', SA: 'SAU',
  SB: 'SLB', SC: 'SYC', SD: 'SDN', SE: 'SWE', SG: 'SGP', SI: 'SVN', SK: 'SVK', SL: 'SLE',
  SM: 'SMR', SN: 'SEN', SO: 'SOM', SR: 'SUR', SS: 'SSD', ST: 'STP', SV: 'SLV', SY: 'SYR',
  SZ: 'SWZ', TD: 'TCD', TG: 'TGO', TH: 'THA', TJ: 'TJK', TL: 'TLS', TM: 'TKM', TN: 'TUN',
  TO: 'TON', TR: 'TUR', TT: 'TTO', TV: 'TUV', TW: 'TWN', TZ: 'TZA', UA: 'UKR', UG: 'UGA',
  US: 'USA', UY: 'URY', UZ: 'UZB', VA: 'VAT', VC: 'VCT', VE: 'VEN', VN: 'VNM', VU: 'VUT',
  WS: 'WSM', XK: 'XKX', YE: 'YEM', ZA: 'ZAF', ZM: 'ZMB', ZW: 'ZWE', GL: 'GRL',
};

// ISO 3166-1 numeric ID to Alpha-2 mapping for world-atlas
const NUMERIC_TO_ALPHA2: Record<string, string> = {
  '004': 'AF', '008': 'AL', '010': 'AQ', '012': 'DZ', '016': 'AS', '020': 'AD', '024': 'AO',
  '028': 'AG', '031': 'AZ', '032': 'AR', '036': 'AU', '040': 'AT', '044': 'BS', '048': 'BH',
  '050': 'BD', '051': 'AM', '052': 'BB', '056': 'BE', '060': 'BM', '064': 'BT', '068': 'BO',
  '070': 'BA', '072': 'BW', '076': 'BR', '084': 'BZ', '086': 'IO', '090': 'SB', '092': 'VG',
  '096': 'BN', '100': 'BG', '104': 'MM', '108': 'BI', '112': 'BY', '116': 'KH', '120': 'CM',
  '124': 'CA', '132': 'CV', '136': 'KY', '140': 'CF', '144': 'LK', '148': 'TD', '152': 'CL',
  '156': 'CN', '158': 'TW', '170': 'CO', '174': 'KM', '175': 'YT', '178': 'CG', '180': 'CD',
  '184': 'CK', '188': 'CR', '191': 'HR', '192': 'CU', '196': 'CY', '203': 'CZ', '204': 'BJ',
  '208': 'DK', '212': 'DM', '214': 'DO', '218': 'EC', '222': 'SV', '226': 'GQ', '231': 'ET',
  '232': 'ER', '233': 'EE', '234': 'FO', '238': 'FK', '242': 'FJ', '246': 'FI', '248': 'AX',
  '250': 'FR', '254': 'GF', '258': 'PF', '260': 'TF', '262': 'DJ', '266': 'GA', '268': 'GE',
  '270': 'GM', '275': 'PS', '276': 'DE', '288': 'GH', '292': 'GI', '296': 'KI', '300': 'GR',
  '304': 'GL', '308': 'GD', '312': 'GP', '316': 'GU', '320': 'GT', '324': 'GN', '328': 'GY',
  '332': 'HT', '336': 'VA', '340': 'HN', '344': 'HK', '348': 'HU', '352': 'IS', '356': 'IN',
  '360': 'ID', '364': 'IR', '368': 'IQ', '372': 'IE', '376': 'IL', '380': 'IT', '384': 'CI',
  '388': 'JM', '392': 'JP', '398': 'KZ', '400': 'JO', '404': 'KE', '408': 'KP', '410': 'KR',
  '414': 'KW', '417': 'KG', '418': 'LA', '422': 'LB', '426': 'LS', '428': 'LV', '430': 'LR',
  '434': 'LY', '438': 'LI', '440': 'LT', '442': 'LU', '446': 'MO', '450': 'MG', '454': 'MW',
  '458': 'MY', '462': 'MV', '466': 'ML', '470': 'MT', '474': 'MQ', '478': 'MR', '480': 'MU',
  '484': 'MX', '492': 'MC', '496': 'MN', '498': 'MD', '499': 'ME', '500': 'MS', '504': 'MA',
  '508': 'MZ', '512': 'OM', '516': 'NA', '520': 'NR', '524': 'NP', '528': 'NL', '531': 'CW',
  '533': 'AW', '534': 'SX', '535': 'BQ', '540': 'NC', '548': 'VU', '554': 'NZ', '558': 'NI',
  '562': 'NE', '566': 'NG', '570': 'NU', '574': 'NF', '578': 'NO', '580': 'MP', '583': 'FM',
  '584': 'MH', '585': 'PW', '586': 'PK', '591': 'PA', '598': 'PG', '600': 'PY', '604': 'PE',
  '608': 'PH', '612': 'PN', '616': 'PL', '620': 'PT', '624': 'GW', '626': 'TL', '630': 'PR',
  '634': 'QA', '638': 'RE', '642': 'RO', '643': 'RU', '646': 'RW', '652': 'BL', '654': 'SH',
  '659': 'KN', '660': 'AI', '662': 'LC', '663': 'MF', '666': 'PM', '670': 'VC', '674': 'SM',
  '678': 'ST', '682': 'SA', '686': 'SN', '688': 'RS', '690': 'SC', '694': 'SL', '702': 'SG',
  '703': 'SK', '704': 'VN', '705': 'SI', '706': 'SO', '710': 'ZA', '716': 'ZW', '724': 'ES',
  '728': 'SS', '729': 'SD', '732': 'EH', '740': 'SR', '744': 'SJ', '748': 'SZ', '752': 'SE',
  '756': 'CH', '760': 'SY', '762': 'TJ', '764': 'TH', '768': 'TG', '772': 'TK', '776': 'TO',
  '780': 'TT', '784': 'AE', '788': 'TN', '792': 'TR', '795': 'TM', '796': 'TC', '798': 'TV',
  '800': 'UG', '804': 'UA', '807': 'MK', '818': 'EG', '826': 'GB', '831': 'GG', '832': 'JE',
  '833': 'IM', '834': 'TZ', '840': 'US', '850': 'VI', '854': 'BF', '858': 'UY', '860': 'UZ',
  '862': 'VE', '876': 'WF', '882': 'WS', '887': 'YE', '894': 'ZM',
};

async function getCachedJson(url: string, cacheKey: string): Promise<any | null> {
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);

  const diskPath = join(CACHE_DIR, `${cacheKey}.json`);
  if (existsSync(diskPath)) {
    try {
      const data = JSON.parse(await readFile(diskPath, 'utf8'));
      memoryCache.set(cacheKey, data);
      return data;
    } catch {
      // Fall through to fetch
    }
  }

  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GeoGuessr-Country-Streaks-Bot/1.0' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    memoryCache.set(cacheKey, data);

    (async () => {
      try {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(diskPath, JSON.stringify(data), 'utf8');
      } catch {
        // Ignore cache write errors
      }
    })();

    return data;
  } catch {
    return null;
  }
}

function projectPoint(lon: number, lat: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sinLat = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

async function fetchOsmTile(zoom: number, x: number, y: number): Promise<Buffer | null> {
  const tileCount = 2 ** zoom;
  if (y < 0 || y >= tileCount) return null;
  const wrappedX = ((x % tileCount) + tileCount) % tileCount;
  try {
    const res = await fetch(`https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`, {
      headers: { 'User-Agent': 'GeoGuessr-Country-Streaks-Bot/1.0' },
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) return null;
    return sharp(Buffer.from(await res.arrayBuffer())).resize(TILE_SIZE, TILE_SIZE).png().toBuffer();
  } catch {
    return null;
  }
}

async function renderOsmBaseMap(
  zoom: number,
  center: { x: number; y: number },
  width: number,
  height: number,
): Promise<{ baseBuffer: Buffer; viewport: { x: number; y: number } }> {
  const viewport = { x: center.x - width / 2, y: center.y - height / 2 };
  const firstTile = { x: Math.floor(viewport.x / TILE_SIZE), y: Math.floor(viewport.y / TILE_SIZE) };
  const lastTile = {
    x: Math.floor((viewport.x + width - 1) / TILE_SIZE),
    y: Math.floor((viewport.y + height - 1) / TILE_SIZE),
  };

  const canvasWidth = (lastTile.x - firstTile.x + 1) * TILE_SIZE;
  const canvasHeight = (lastTile.y - firstTile.y + 1) * TILE_SIZE;
  const overlays: sharp.OverlayOptions[] = [];

  const tilePromises: Promise<{ x: number; y: number; buffer: Buffer | null }>[] = [];
  for (let x = firstTile.x; x <= lastTile.x; x++) {
    for (let y = firstTile.y; y <= lastTile.y; y++) {
      tilePromises.push(fetchOsmTile(zoom, x, y).then((buf) => ({ x, y, buffer: buf })));
    }
  }

  const fetched = await Promise.all(tilePromises);
  for (const { x, y, buffer } of fetched) {
    if (buffer) {
      overlays.push({
        input: buffer,
        left: (x - firstTile.x) * TILE_SIZE,
        top: (y - firstTile.y) * TILE_SIZE,
      });
    }
  }

  let baseBuffer: Buffer;
  try {
    const stitched = await sharp({
      create: { width: canvasWidth, height: canvasHeight, channels: 3, background: '#e5e7eb' },
    })
      .composite(overlays)
      .png()
      .toBuffer();

    baseBuffer = await sharp(stitched)
      .extract({
        left: Math.round(viewport.x - firstTile.x * TILE_SIZE),
        top: Math.round(viewport.y - firstTile.y * TILE_SIZE),
        width,
        height,
      })
      .png()
      .toBuffer();
  } catch {
    baseBuffer = await sharp({
      create: { width, height, channels: 3, background: '#1e1f22' },
    }).png().toBuffer();
  }

  return { baseBuffer, viewport };
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

function getFeatureBounds(feature: any): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  let minLng = 180;
  let maxLng = -180;
  let minLat = 90;
  let maxLat = -90;

  function traverse(coords: any) {
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const lng = coords[0];
      const lat = coords[1];
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    } else if (Array.isArray(coords)) {
      for (const c of coords) traverse(c);
    }
  }

  if (feature?.geometry?.coordinates) {
    traverse(feature.geometry.coordinates);
  }
  return { minLng, maxLng, minLat, maxLat };
}

function reverseCoords(coords: any, type: string): any {
  if (type === 'Polygon') {
    return coords.map((ring: any) => ring.slice().reverse());
  }
  if (type === 'MultiPolygon') {
    return coords.map((poly: any) => poly.map((ring: any) => ring.slice().reverse()));
  }
  return coords;
}

function normalizeFeatureWinding(f: any): any {
  if (!f?.geometry?.coordinates) return f;
  // geoBoundaries polygons are wound in standard planar order rather than the spherical right-hand rule
  // Reversing ring coordinates prevents D3 from treating the polygon as inverted (filling the whole planet)
  const reversed = reverseCoords(f.geometry.coordinates, f.geometry.type);
  return { ...f, geometry: { ...f.geometry, coordinates: reversed } };
}

function isSubdivisionMatch(
  countryCode: string,
  props: any,
  targetNormCode: string,
  targetName: string | null,
): boolean {
  if (!targetNormCode && !targetName) return false;
  const candidates = [
    props.shapeName,
    props.name,
    props.shapeISO ? props.shapeISO.replace(/^[A-Z]+-/, '') : null,
    props['postal-code'],
    props['hc-a2'],
    props.hasc ? props.hasc.replace(/^[A-Z]+\./, '') : null,
    props['hc-key'] ? props['hc-key'].replace(/^[a-z]+-/, '') : null,
  ].filter(Boolean) as string[];

  for (const c of candidates) {
    const cleanCandidate = normalizeSubdivisionCode(c)?.toUpperCase();
    if (cleanCandidate && targetNormCode && cleanCandidate === targetNormCode) return true;
    if (targetName && c.trim().toLowerCase() === targetName.trim().toLowerCase()) return true;
    const resolved = resolveSubdivision(countryCode, c);
    if (resolved) {
      if (targetNormCode && resolved.code.toUpperCase() === targetNormCode) return true;
      if (targetName && resolved.name.trim().toLowerCase() === targetName.trim().toLowerCase()) return true;
    }
  }
  return false;
}

async function loadCountrySubdivisions(countryCode: string): Promise<any | null> {
  const upper = countryCode.toUpperCase();
  const alpha3 = ALPHA2_TO_ALPHA3[upper] || upper;
  let collection: any = null;
  const metaUrl = `https://www.geoboundaries.org/api/current/gbOpen/${alpha3}/ADM1/`;
  const meta = await getCachedJson(metaUrl, `geoboundaries-meta-${alpha3}`);

  if (meta?.simplifiedGeometryGeoJSON) {
    collection = await getCachedJson(meta.simplifiedGeometryGeoJSON, `geoboundaries-data-${alpha3}`);
  }

  if (!collection?.features?.length) {
    const topo = await getCachedJson('', `country-${upper.toLowerCase()}.topo`);
    if (topo?.objects?.default) {
      collection = feature(topo, topo.objects.default);
    }
  }

  if (!collection?.features?.length) return null;

  return {
    ...collection,
    features: collection.features.map((f: any) => normalizeFeatureWinding(f)),
  };
}

export interface ResultMapOptions {
  mode: 'country' | 'subdivision';
  countryCode?: string | null;
  actualCode: string | null;
  actualName: string | null;
  actualLat?: number | null;
  actualLng?: number | null;
  winningCode?: string | null;
  winningName?: string | null;
  winningSubdivisionCode?: string | null;
  winningSubdivisionName?: string | null;
  isCorrect: boolean;
}

/** Render a world or country map highlighting actual (green) and guessed (red) locations. */
export async function renderResultMap(opts: ResultMapOptions): Promise<Buffer | null> {
  if (!opts.actualCode && !opts.actualName) return null;

  try {
    if (opts.mode === 'subdivision' && opts.countryCode) {
      return await renderSubdivisionMap(opts);
    }
    return await renderCountryMap(opts);
  } catch {
    return null;
  }
}

async function renderCountryMap(opts: ResultMapOptions): Promise<Buffer | null> {
  const url = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
  const topo = await getCachedJson(url, 'world-atlas-110m');
  if (!topo?.objects?.countries) return null;

  const collection = feature(topo, topo.objects.countries) as any;
  if (!collection?.features?.length) return null;

  const actualTarget = (opts.actualCode ?? '').toUpperCase();
  const guessTarget = (!opts.isCorrect && opts.winningCode ? opts.winningCode : '').toUpperCase();

  const getFeatureAlpha2 = (f: any): string => {
    const rawId = String(f.id ?? '');
    const padded = rawId.padStart(3, '0');
    return NUMERIC_TO_ALPHA2[padded] || NUMERIC_TO_ALPHA2[rawId] || '';
  };

  const actualFeatures = collection.features.filter((f: any) => getFeatureAlpha2(f) === actualTarget);
  const guessFeatures = guessTarget ? collection.features.filter((f: any) => getFeatureAlpha2(f) === guessTarget) : [];

  let guessSubFeature: any = null;
  if (!opts.isCorrect && opts.winningCode && (opts.winningSubdivisionCode || opts.winningSubdivisionName)) {
    const guessSubCollection = await loadCountrySubdivisions(opts.winningCode);
    if (guessSubCollection?.features?.length) {
      const normSubCode = normalizeSubdivisionCode(opts.winningSubdivisionCode)?.toUpperCase() ?? '';
      guessSubFeature = guessSubCollection.features.find((f: any) =>
        isSubdivisionMatch(opts.winningCode!, f.properties, normSubCode, opts.winningSubdivisionName ?? null),
      );
    }
  }

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const expandBounds = (features: any[]) => {
    for (const f of features) {
      const b = getFeatureBounds(f);
      if (Number.isFinite(b.minLng) && Number.isFinite(b.maxLng) && Number.isFinite(b.minLat) && Number.isFinite(b.maxLat)) {
        minLng = Math.min(minLng, b.minLng);
        maxLng = Math.max(maxLng, b.maxLng);
        minLat = Math.min(minLat, b.minLat);
        maxLat = Math.max(maxLat, b.maxLat);
      }
    }
  };

  expandBounds(actualFeatures);
  if (!opts.isCorrect) {
    if (guessSubFeature) expandBounds([guessSubFeature]);
    else expandBounds(guessFeatures);
  }

  if (!Number.isFinite(minLng)) {
    minLng = -180;
    maxLng = 180;
    minLat = -60;
    maxLat = 75;
  }

  const lngPadding = Math.max(1, (maxLng - minLng) * 0.15);
  const latPadding = Math.max(1, (maxLat - minLat) * 0.15);
  const paddedMinLng = Math.max(-180, minLng - lngPadding);
  const paddedMaxLng = Math.min(180, maxLng + lngPadding);
  const paddedMinLat = Math.max(-85, minLat - latPadding);
  const paddedMaxLat = Math.min(85, maxLat + latPadding);

  let zoom = 1;
  let center = projectPoint((paddedMinLng + paddedMaxLng) / 2, (paddedMinLat + paddedMaxLat) / 2, zoom);

  for (let z = 6; z >= 1; z--) {
    const p1 = projectPoint(paddedMinLng, paddedMaxLat, z);
    const p2 = projectPoint(paddedMaxLng, paddedMinLat, z);
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    if (dx <= WIDTH - 80 && dy <= HEIGHT - 80) {
      zoom = z;
      center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      break;
    }
  }

  const { baseBuffer, viewport } = await renderOsmBaseMap(zoom, center, WIDTH, HEIGHT);

  const d3Scale = (TILE_SIZE * 2 ** zoom) / (2 * Math.PI);
  const d3Translate: [number, number] = [
    (TILE_SIZE * 2 ** zoom) / 2 - viewport.x,
    (TILE_SIZE * 2 ** zoom) / 2 - viewport.y,
  ];

  const projection = geoMercator().scale(d3Scale).translate(d3Translate).center([0, 0]);
  const pathGenerator = geoPath(projection);

  const actualCentroids: [number, number][] = [];
  const guessCentroids: [number, number][] = [];

  const paths = collection.features.map((f: any) => {
    const a2 = getFeatureAlpha2(f);
    const isActual = a2 === actualTarget;
    const isGuess = Boolean(guessTarget && a2 === guessTarget);

    if (!isActual && !isGuess) return '';

    let fill = 'none';
    let stroke = '#1f2937';
    let strokeWidth = '1';

    if (isActual) {
      fill = 'rgba(34, 197, 94, 0.45)';
      stroke = '#16a34a';
      strokeWidth = '2.5';
      if (typeof opts.actualLat === 'number' && typeof opts.actualLng === 'number') {
        const pt = projection([opts.actualLng, opts.actualLat]);
        if (pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1]) && actualCentroids.length === 0) {
          actualCentroids.push(pt as [number, number]);
        }
      } else {
        const c = pathGenerator.centroid(f);
        if (Number.isFinite(c[0]) && Number.isFinite(c[1])) actualCentroids.push(c as [number, number]);
      }
    } else if (isGuess) {
      fill = 'rgba(239, 68, 68, 0.45)';
      stroke = '#dc2626';
      strokeWidth = '2.5';
      if (guessSubFeature) {
        if (guessCentroids.length === 0) {
          const c = pathGenerator.centroid(guessSubFeature);
          if (Number.isFinite(c[0]) && Number.isFinite(c[1])) guessCentroids.push(c as [number, number]);
        }
      } else {
        const c = pathGenerator.centroid(f);
        if (Number.isFinite(c[0]) && Number.isFinite(c[1])) guessCentroids.push(c as [number, number]);
      }
    }

    const d = pathGenerator(f);
    if (!d) return '';
    return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }).filter(Boolean).join('\n');

  const markers: string[] = [];
  for (const [x, y] of actualCentroids) {
    markers.push(
      `<circle cx="${x}" cy="${y}" r="9" fill="#16a34a" stroke="#ffffff" stroke-width="2.5" />` +
      `<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="${MAP_FONT}" font-size="10" font-weight="bold" fill="#ffffff">A</text>`,
    );
  }
  for (const [x, y] of guessCentroids) {
    markers.push(
      `<circle cx="${x}" cy="${y}" r="9" fill="#dc2626" stroke="#ffffff" stroke-width="2.5" />` +
      `<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="${MAP_FONT}" font-size="10" font-weight="bold" fill="#ffffff">G</text>`,
    );
  }

  const legend = renderLegend(opts);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    ${paths}
    ${markers.join('\n')}
    ${legend}
  </svg>`;

  return await sharp(baseBuffer)
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function renderSubdivisionMap(opts: ResultMapOptions): Promise<Buffer | null> {
  const countryCode = opts.countryCode!.toUpperCase();
  const collection = await loadCountrySubdivisions(countryCode);
  if (!collection?.features?.length) return null;

  const normActual = normalizeSubdivisionCode(opts.actualCode)?.toUpperCase() ?? '';
  const normGuess = (!opts.isCorrect && opts.winningCode ? normalizeSubdivisionCode(opts.winningCode) : null)?.toUpperCase() ?? '';

  const actualFeatures = collection.features.filter((f: any) => isSubdivisionMatch(countryCode, f.properties, normActual, opts.actualName));
  const guessFeatures = normGuess || opts.winningName ? collection.features.filter((f: any) => isSubdivisionMatch(countryCode, f.properties, normGuess, opts.winningName ?? null)) : [];

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  // Calculate bounding box focusing on the highlighted actual & guess subdivisions
  const highlighted = actualFeatures.concat(guessFeatures);
  const targetFeatures = highlighted.length > 0 ? highlighted : collection.features;
  for (const f of targetFeatures) {
    const b = getFeatureBounds(f);
    if (Number.isFinite(b.minLng) && Number.isFinite(b.maxLng) && Number.isFinite(b.minLat) && Number.isFinite(b.maxLat)) {
      minLng = Math.min(minLng, b.minLng);
      maxLng = Math.max(maxLng, b.maxLng);
      minLat = Math.min(minLat, b.minLat);
      maxLat = Math.max(maxLat, b.maxLat);
    }
  }

  if (!Number.isFinite(minLng)) return null;

  const lngPadding = Math.max(0.5, (maxLng - minLng) * 0.15);
  const latPadding = Math.max(0.5, (maxLat - minLat) * 0.15);
  const paddedMinLng = Math.max(-180, minLng - lngPadding);
  const paddedMaxLng = Math.min(180, maxLng + lngPadding);
  const paddedMinLat = Math.max(-85, minLat - latPadding);
  const paddedMaxLat = Math.min(85, maxLat + latPadding);

  let zoom = 1;
  let center = projectPoint((paddedMinLng + paddedMaxLng) / 2, (paddedMinLat + paddedMaxLat) / 2, zoom);

  for (let z = 8; z >= 1; z--) {
    const p1 = projectPoint(paddedMinLng, paddedMaxLat, z);
    const p2 = projectPoint(paddedMaxLng, paddedMinLat, z);
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    if (dx <= WIDTH - 60 && dy <= HEIGHT - 60) {
      zoom = z;
      center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      break;
    }
  }

  const { baseBuffer, viewport } = await renderOsmBaseMap(zoom, center, WIDTH, HEIGHT);

  const d3Scale = (TILE_SIZE * 2 ** zoom) / (2 * Math.PI);
  const d3Translate: [number, number] = [
    (TILE_SIZE * 2 ** zoom) / 2 - viewport.x,
    (TILE_SIZE * 2 ** zoom) / 2 - viewport.y,
  ];

  const projection = geoMercator().scale(d3Scale).translate(d3Translate).center([0, 0]);
  const pathGenerator = geoPath(projection);

  const actualCentroids: [number, number][] = [];
  const guessCentroids: [number, number][] = [];

  const paths = collection.features.map((f: any) => {
    const isActual = isSubdivisionMatch(countryCode, f.properties, normActual, opts.actualName);
    const isGuess = isSubdivisionMatch(countryCode, f.properties, normGuess, opts.winningName ?? null);

    let fill = 'none';
    let stroke = 'rgba(100, 116, 139, 0.45)';
    let strokeWidth = '1';

    if (isActual) {
      fill = 'rgba(34, 197, 94, 0.45)';
      stroke = '#16a34a';
      strokeWidth = '2.5';
      if (typeof opts.actualLat === 'number' && typeof opts.actualLng === 'number') {
        const pt = projection([opts.actualLng, opts.actualLat]);
        if (pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1]) && actualCentroids.length === 0) {
          actualCentroids.push(pt as [number, number]);
        }
      } else {
        const c = pathGenerator.centroid(f);
        if (Number.isFinite(c[0]) && Number.isFinite(c[1])) actualCentroids.push(c as [number, number]);
      }
    } else if (isGuess) {
      fill = 'rgba(239, 68, 68, 0.45)';
      stroke = '#dc2626';
      strokeWidth = '2.5';
      const c = pathGenerator.centroid(f);
      if (Number.isFinite(c[0]) && Number.isFinite(c[1])) guessCentroids.push(c as [number, number]);
    }

    const d = pathGenerator(f);
    if (!d) return '';
    return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  }).filter(Boolean).join('\n');

  const markers: string[] = [];
  for (const [x, y] of actualCentroids) {
    markers.push(
      `<circle cx="${x}" cy="${y}" r="9" fill="#16a34a" stroke="#ffffff" stroke-width="2.5" />` +
      `<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="${MAP_FONT}" font-size="10" font-weight="bold" fill="#ffffff">A</text>`,
    );
  }
  for (const [x, y] of guessCentroids) {
    markers.push(
      `<circle cx="${x}" cy="${y}" r="9" fill="#dc2626" stroke="#ffffff" stroke-width="2.5" />` +
      `<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="${MAP_FONT}" font-size="10" font-weight="bold" fill="#ffffff">G</text>`,
    );
  }

  const legend = renderLegend(opts);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    ${paths}
    ${markers.join('\n')}
    ${legend}
  </svg>`;

  return await sharp(baseBuffer)
    .composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png()
    .toBuffer();
}

function estimateTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    if (/[WM]/.test(ch)) width += 9.5;
    else if (/[A-Z]/.test(ch)) width += 7.8;
    else if (/[mw]/.test(ch)) width += 8.2;
    else if (/[fjlrtiI1.,'!: ]/.test(ch)) width += 3.8;
    else width += 6.5;
  }
  return Math.ceil(width);
}

function renderLegend(opts: ResultMapOptions): string {
  const font = MAP_FONT;
  const actualText = escapeXml(opts.actualName ?? opts.actualCode ?? 'Actual');
  const guessText = escapeXml(opts.winningName ?? opts.winningCode ?? 'Guess');

  if (opts.isCorrect || !opts.winningName) {
    const textWidth = estimateTextWidth(actualText);
    const badgeWidth = 36 + textWidth + 12;
    return `<g transform="translate(12, ${HEIGHT - 34})">
      <rect width="${badgeWidth}" height="24" rx="5" fill="#111827" fill-opacity="0.92" stroke="#374151" stroke-width="1" />
      <circle cx="13" cy="12" r="4.5" fill="#22c55e" />
      <text x="23" y="16.5" font-family="${font}" font-size="12" font-weight="600" fill="#f3f4f6">${actualText}</text>
    </g>`;
  }

  const actualBadgeWidth = 92 + estimateTextWidth(actualText);
  const guessBadgeWidth = 88 + estimateTextWidth(guessText);
  const fitsOneLine = actualBadgeWidth + guessBadgeWidth + 32 <= WIDTH;
  const actualY = fitsOneLine ? HEIGHT - 34 : HEIGHT - 62;
  const guessX = fitsOneLine ? actualBadgeWidth + 8 : 0;
  const guessY = fitsOneLine ? 0 : 28;

  return `<g transform="translate(12, ${actualY})">
    <g transform="translate(0, 0)">
      <rect width="${actualBadgeWidth}" height="24" rx="5" fill="#111827" fill-opacity="0.92" stroke="#374151" stroke-width="1" />
      <circle cx="13" cy="12" r="4.5" fill="#22c55e" />
      <text x="23" y="16.5" font-family="${font}" font-size="12" fill="#f3f4f6">
        <tspan font-weight="bold">Actual:</tspan> <tspan font-weight="normal">${actualText}</tspan>
      </text>
    </g>
    <g transform="translate(${guessX}, ${guessY})">
      <rect width="${guessBadgeWidth}" height="24" rx="5" fill="#111827" fill-opacity="0.92" stroke="#374151" stroke-width="1" />
      <circle cx="13" cy="12" r="4.5" fill="#ef4444" />
      <text x="23" y="16.5" font-family="${font}" font-size="12" fill="#f3f4f6">
        <tspan font-weight="bold">Guess:</tspan> <tspan font-weight="normal">${guessText}</tspan>
      </text>
    </g>
  </g>`;
}

