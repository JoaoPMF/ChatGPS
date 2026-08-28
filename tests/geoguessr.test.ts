import { describe, expect, it } from 'vitest';
import { decodePanoId } from '../src/geoguessr.js';

describe('decodePanoId', () => {
  it('decodes hex-encoded pano ids', () => {
    // "5F726B7A45724E4235484A6C326247372D5F44324C41" decodes to "_rkzErNB5HJl2bG7-_D2LA"
    expect(decodePanoId('5F726B7A45724E4235484A6C326247372D5F44324C41')).toBe('_rkzErNB5HJl2bG7-_D2LA');
  });

  it('leaves plain pano ids untouched', () => {
    expect(decodePanoId('_rkzErNB5HJl2bG7-_D2LA')).toBe('_rkzErNB5HJl2bG7-_D2LA');
  });

  it('returns null for null', () => {
    expect(decodePanoId(null)).toBeNull();
  });
});
