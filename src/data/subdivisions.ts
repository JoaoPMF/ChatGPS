import iso31662 from 'iso-3166-2';

export interface SubdivisionDef {
  /** ISO 3166-2 code without the country prefix. */
  code: string;
  name: string;
  aliases: string[];
}

interface IsoSubdivision {
  name: string;
  type?: string;
}

interface IsoCountry {
  sub?: Record<string, IsoSubdivision>;
}

const data = (iso31662 as unknown as { data: Record<string, IsoCountry> }).data;

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function makeCountry(countryCode: string): SubdivisionDef[] {
  const country = data[countryCode];
  if (!country?.sub) return [];

  return Object.entries(country.sub).map(([fullCode, subdivision]) => {
    const code = fullCode.slice(countryCode.length + 1);
    const name = subdivision.name;
    const aliases = [...new Set([
      name,
      stripDiacritics(name),
      code,
      code.replace(/[-_]/g, ' '),
    ].map((alias) => alias.toLowerCase().trim()).filter(Boolean))];
    return { code, name, aliases };
  });
}

/** Complete ISO 3166-2 first-level subdivision data for supported country maps. */
export const SUBDIVISIONS: Record<string, SubdivisionDef[]> = {
  PT: makeCountry('PT'),
  AR: makeCountry('AR'),
  AU: makeCountry('AU'),
  BR: makeCountry('BR'),
  CA: makeCountry('CA'),
  CL: makeCountry('CL'),
  CO: makeCountry('CO'),
  IN: makeCountry('IN'),
  ID: makeCountry('ID'),
  JP: makeCountry('JP'),
  KZ: makeCountry('KZ'),
  PH: makeCountry('PH'),
  RU: makeCountry('RU'),
  ZA: makeCountry('ZA'),
  US: makeCountry('US'),
};

export function normalizeSubdivisionCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  const dash = upper.indexOf('-');
  return dash >= 0 ? upper.slice(dash + 1) : upper;
}

export function resolveSubdivision(countryCode: string, input: string): SubdivisionDef | null {
  const normalized = stripDiacritics(input).toLowerCase().trim();
  return (SUBDIVISIONS[countryCode.toUpperCase()] ?? []).find((subdivision) =>
    subdivision.code.toLowerCase() === normalized || subdivision.aliases.includes(normalized),
  ) ?? null;
}
