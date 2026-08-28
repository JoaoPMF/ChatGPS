import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  DEFAULT_VIEW,
  averageBrightness,
  extractView,
  guessHeading,
  normalizeHeading,
  renderRoundView,
} from '../src/projection.js';

/** Build a synthetic equirectangular panorama: left half red, right half blue. */
async function makeTestPano(width = 360, height = 180): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const off = (y * width + x) * 3;
      if (x < width / 2) {
        raw[off] = 255; // red
      } else {
        raw[off + 2] = 255; // blue
      }
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg().toBuffer();
}

describe('normalizeHeading', () => {
  it('normalizes to [-180, 180)', () => {
    expect(normalizeHeading(0)).toBe(0);
    expect(normalizeHeading(304)).toBeCloseTo(-56);
    expect(normalizeHeading(-90)).toBe(-90);
    expect(normalizeHeading(360)).toBe(0);
    expect(normalizeHeading(540)).toBeCloseTo(-180);
  });
});

describe('extractView', () => {
  it('renders a jpeg of the requested size', async () => {
    const pano = await makeTestPano();
    const view = await extractView(pano, { ...DEFAULT_VIEW, heading: -90, width: 320, height: 180 });
    const meta = await sharp(view).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(180);
  });

  it('looks in the heading direction: heading -90 shows the red half', async () => {
    const pano = await makeTestPano();
    const view = await extractView(pano, { ...DEFAULT_VIEW, heading: -90, width: 160, height: 90 });
    const { data } = await sharp(view).raw().toBuffer({ resolveWithObject: true });
    // center pixel
    const off = (45 * 160 + 80) * 3;
    expect(data[off]).toBeGreaterThan(120); // red channel dominant
    expect(data[off + 2]).toBeLessThan(120);
  });

  it('heading +90 shows the blue half', async () => {
    const pano = await makeTestPano();
    const view = await extractView(pano, { ...DEFAULT_VIEW, heading: 90, width: 160, height: 90 });
    const { data } = await sharp(view).raw().toBuffer({ resolveWithObject: true });
    const off = (45 * 160 + 80) * 3;
    expect(data[off + 2]).toBeGreaterThan(120); // blue channel dominant
    expect(data[off]).toBeLessThan(120);
  });
});

describe('guessHeading', () => {
  it('returns a heading in [-180, 180]', async () => {
    const pano = await makeTestPano();
    const heading = await guessHeading(pano);
    expect(heading).toBeGreaterThanOrEqual(-180);
    expect(heading).toBeLessThan(180);
  });
});

describe('renderRoundView', () => {
  const baseCam = { heading: 90, pitch: 0, zoom: 0, photosphere: false, official: true, drivingDirection: null as number | null };

  it('returns a view using the map camera', async () => {
    const pano = await makeTestPano();
    const view = await renderRoundView(pano, { ...baseCam, heading: -90 });
    expect(view.length).toBeGreaterThan(0);
  });

  it('uses the authored heading when there is no driving direction', async () => {
    const pano = await makeTestPano(); // left half red (lon<0), right half blue (lon>0)
    const view = await renderRoundView(pano, { ...baseCam, heading: 90 });
    // heading 90 (lon +90) → right half → blue dominant.
    const { data, info } = await sharp(view).raw().toBuffer({ resolveWithObject: true });
    const off = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 3;
    expect(data[off + 2]).toBeGreaterThan(data[off]);
  });

  it('subtracts the driving direction (reference-bot behavior)', async () => {
    const pano = await makeTestPano();
    // mapHeading 90, drivingDirection 180 → relative -90 → left half → red dominant.
    const view = await renderRoundView(pano, { ...baseCam, heading: 90, drivingDirection: 180 });
    const { data, info } = await sharp(view).raw().toBuffer({ resolveWithObject: true });
    const off = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 3;
    expect(data[off]).toBeGreaterThan(data[off + 2]);
  });

  it('never returns null for a renderable pano, even a very dark one', async () => {
    // Solid near-black panorama (night location).
    const raw = Buffer.alloc(360 * 180 * 3, 10);
    const darkPano = await sharp(raw, { raw: { width: 360, height: 180, channels: 3 } }).jpeg().toBuffer();
    expect(await averageBrightness(darkPano)).toBeLessThan(20);

    const view = await renderRoundView(darkPano, { ...baseCam, heading: 0 });
    expect(view).not.toBeNull();
    expect(view.length).toBeGreaterThan(0);
  });
});
