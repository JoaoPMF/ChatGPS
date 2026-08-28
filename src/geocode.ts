import { nameOf, sovereignOf } from './countries.js';

export interface GeoResult {
  /** Sovereign-state ISO alpha-2 code (territory rules applied). */
  code: string;
  /** Canonical display name. */
  name: string;
  /** Principal subdivision (state/province/region), when available. */
  subdivision: string | null;
  /** Full ISO 3166-2 code, for example US-CA or PT-11. */
  subdivisionCode?: string | null;
}

export interface IGeocoder {
  countryAt(lat: number, lng: number): Promise<GeoResult | null>;
}

/** Reverse geocoding via BigDataCloud's free API. */
export class Geocoder implements IGeocoder {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async countryAt(lat: number, lng: number): Promise<GeoResult | null> {
    const url =
      `https://api.bigdatacloud.net/data/reverse-geocode` +
      `?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}` +
      `&key=${encodeURIComponent(this.apiKey)}`;

    const res = await this.fetchFn(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Reverse geocoding failed with HTTP ${res.status}`);

    const raw = (await res.json()) as any;
    const data = Array.isArray(raw) ? raw[0] : raw;
    const code: string | undefined = data?.countryCode;
    if (!code || code === 'N/A') return null; // ocean / no country

    const sovereign = sovereignOf(code.toUpperCase());
    const name = nameOf(sovereign) ?? data.countryName ?? sovereign;
    const subdivision: string | null = data?.principalSubdivision ?? null;
    const administrative = Array.isArray(data?.localityInfo?.administrative)
      ? data.localityInfo.administrative
      : [];
    const fallbackCode = administrative.find((entry: any) =>
      typeof entry?.isoCode === 'string' && entry.isoCode.toUpperCase().startsWith(`${sovereign}-`),
    )?.isoCode;
    const subdivisionCode: string | null = data?.principalSubdivisionCode || fallbackCode || null;
    return { code: sovereign, name, subdivision, subdivisionCode };
  }
}
