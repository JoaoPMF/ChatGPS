import sharp from 'sharp';
import type { Coordinates } from './hedge.js';

const WIDTH = 360;
const HEIGHT = 240;
const TILE_SIZE = 256;
const PADDING = 64;

function project(point: Coordinates, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat));
  const sinLatitude = Math.sin(latitude * Math.PI / 180);
  return {
    x: ((point.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  };
}

function closestLongitude(from: number, to: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  return from + delta;
}

function mapZoom(guess: Coordinates, actual: Coordinates): number {
  const adjustedActual = { ...actual, lng: closestLongitude(guess.lng, actual.lng) };
  for (let zoom = 16; zoom >= 0; zoom--) {
    const guessedPoint = project(guess, zoom);
    const actualPoint = project(adjustedActual, zoom);
    if (Math.abs(guessedPoint.x - actualPoint.x) <= WIDTH - PADDING * 2 &&
      Math.abs(guessedPoint.y - actualPoint.y) <= HEIGHT - PADDING * 2) return zoom;
  }
  return 0;
}

async function tile(zoom: number, x: number, y: number): Promise<Buffer | null> {
  const tileCount = 2 ** zoom;
  if (y < 0 || y >= tileCount) return null;
  const wrappedX = ((x % tileCount) + tileCount) % tileCount;
  try {
    const response = await fetch(`https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`, {
      headers: { 'User-Agent': 'GeoGuessr-Country-Streaks-Bot/1.0' },
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok
      ? sharp(Buffer.from(await response.arrayBuffer())).resize(TILE_SIZE, TILE_SIZE).png().toBuffer()
      : null;
  } catch {
    return null;
  }
}

function markerSvg(guess: { x: number; y: number }, actual: { x: number; y: number }): Buffer {
  const label = (text: string, x: number, y: number, color: string) =>
    `<circle cx="${x}" cy="${y}" r="8" fill="${color}" stroke="#ffffff" stroke-width="3"/><text x="${x}" y="${y + 4}" text-anchor="middle" font-family="sans-serif" font-size="9" font-weight="bold" fill="#ffffff">${text}</text>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <line x1="${guess.x}" y1="${guess.y}" x2="${actual.x}" y2="${actual.y}" stroke="#263238" stroke-width="2" stroke-dasharray="5 4"/>
    ${label('G', guess.x, guess.y, '#1b8a5a')}
    ${label('A', actual.x, actual.y, '#d84343')}
    <rect x="8" y="${HEIGHT - 30}" width="118" height="22" rx="4" fill="#ffffff" fill-opacity="0.9"/>
    <circle cx="20" cy="${HEIGHT - 19}" r="5" fill="#1b8a5a"/><text x="30" y="${HEIGHT - 15}" font-family="sans-serif" font-size="11" fill="#1f2933">Guess</text>
    <circle cx="76" cy="${HEIGHT - 19}" r="5" fill="#d84343"/><text x="86" y="${HEIGHT - 15}" font-family="sans-serif" font-size="11" fill="#1f2933">Actual</text>
  </svg>`);
}

/** Render a small map showing a hedge guess (G) and the actual round location (A). */
export async function renderHedgeMap(guess: Coordinates, actual: Coordinates): Promise<Buffer> {
  const adjustedActual = { ...actual, lng: closestLongitude(guess.lng, actual.lng) };
  const zoom = mapZoom(guess, adjustedActual);
  const guessedPoint = project(guess, zoom);
  const actualPoint = project(adjustedActual, zoom);
  const center = { x: (guessedPoint.x + actualPoint.x) / 2, y: (guessedPoint.y + actualPoint.y) / 2 };
  const viewport = { x: center.x - WIDTH / 2, y: center.y - HEIGHT / 2 };
  const firstTile = { x: Math.floor(viewport.x / TILE_SIZE), y: Math.floor(viewport.y / TILE_SIZE) };
  const lastTile = {
    x: Math.floor((viewport.x + WIDTH - 1) / TILE_SIZE),
    y: Math.floor((viewport.y + HEIGHT - 1) / TILE_SIZE),
  };
  const canvasWidth = (lastTile.x - firstTile.x + 1) * TILE_SIZE;
  const canvasHeight = (lastTile.y - firstTile.y + 1) * TILE_SIZE;
  const composites: sharp.OverlayOptions[] = [];

  for (let x = firstTile.x; x <= lastTile.x; x++) {
    for (let y = firstTile.y; y <= lastTile.y; y++) {
      const image = await tile(zoom, x, y);
      if (image) composites.push({ input: image, left: (x - firstTile.x) * TILE_SIZE, top: (y - firstTile.y) * TILE_SIZE });
    }
  }

  const tiled = await sharp({ create: { width: canvasWidth, height: canvasHeight, channels: 3, background: '#e5e7eb' } })
    .composite(composites)
    .png()
    .toBuffer();
  const base = await sharp(tiled)
    .extract({
      left: Math.round(viewport.x - firstTile.x * TILE_SIZE),
      top: Math.round(viewport.y - firstTile.y * TILE_SIZE),
      width: WIDTH,
      height: HEIGHT,
    })
    .png()
    .toBuffer();
  return sharp(base)
    .composite([{
      input: await sharp(markerSvg(
        { x: guessedPoint.x - viewport.x, y: guessedPoint.y - viewport.y },
        { x: actualPoint.x - viewport.x, y: actualPoint.y - viewport.y },
      )).resize(WIDTH - 1, HEIGHT - 1).png().toBuffer(),
      left: 0,
      top: 0,
    }])
    .png()
    .toBuffer();
}