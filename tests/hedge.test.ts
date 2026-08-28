import { describe, expect, it } from 'vitest';
import { distanceMeters, formatDistance, parseCoordinates } from '../src/hedge.js';

describe('parseCoordinates', () => {
  it('parses latitude and longitude', () => {
    expect(parseCoordinates('35.0329, -120.5585')).toEqual({ lat: 35.0329, lng: -120.5585 });
  });

  it('parses coordinates from a Google Maps URL', () => {
    expect(parseCoordinates('https://www.google.com/maps/@35.0329,-120.5585,3a,90y')).toEqual({
      lat: 35.0329,
      lng: -120.5585,
    });
  });

  it('rejects invalid coordinates', () => {
    expect(parseCoordinates('not coordinates')).toBeNull();
    expect(parseCoordinates('95, 10')).toBeNull();
    expect(parseCoordinates('10, 181')).toBeNull();
  });
});

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters({ lat: 1, lng: 2 }, { lat: 1, lng: 2 })).toBe(0);
  });

  it('calculates a useful great-circle distance', () => {
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111_195, -2);
  });
});

describe('formatDistance', () => {
  it('formats metres and kilometres', () => {
    expect(formatDistance(250)).toBe('250 m');
    expect(formatDistance(1_500)).toBe('1.5 km');
    expect(formatDistance(150_000)).toBe('150 km');
  });
});
