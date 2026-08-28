import { COUNTRIES, TERRITORY_TO_SOVEREIGN, type CountryDef } from './data/countries.js';
import { COUNTRY_ALIASES } from './data/custom-aliases.js';

/** Normalize free-text input for matching: lowercase, strip diacritics/punctuation, drop leading "the". */
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the\s+/, '');
}

const lookup = new Map<string, CountryDef>();
for (const country of COUNTRIES) {
  lookup.set(normalize(country.name), country);
  lookup.set(country.code.toLowerCase(), country);
  for (const alias of [...(country.aliases ?? []), ...(COUNTRY_ALIASES[country.code] ?? [])]) {
    lookup.set(normalize(alias), country);
  }
}

/** Resolve free-text user input to a canonical country, or null if unknown. */
export function resolveCountry(input: string): CountryDef | null {
  return lookup.get(normalize(input)) ?? null;
}

/** Map a (possibly territory) ISO code to the sovereign state's ISO code. */
export function sovereignOf(code: string): string {
  const upper = code.toUpperCase();
  return TERRITORY_TO_SOVEREIGN[upper] ?? upper;
}

/** Canonical display name for an ISO code (after applying territory rules), or null. */
export function nameOf(code: string): string | null {
  const sovereign = sovereignOf(code);
  return COUNTRIES.find((c) => c.code === sovereign)?.name ?? null;
}
