import iso31662 from 'iso-3166-2';
import { SUBDIVISION_ALIASES } from './custom-aliases.js';

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

/** English display-name corrections for ISO source transliterations. Original names remain aliases. */
const ENGLISH_NAMES: Record<string, string> = {
  'RU-AD': 'Republic of Adygea', 'RU-AL': 'Altai Republic', 'RU-ALT': 'Altai Krai',
  'RU-AMU': 'Amur Oblast', 'RU-ARK': 'Arkhangelsk Oblast', 'RU-AST': 'Astrakhan Oblast',
  'RU-BA': 'Republic of Bashkortostan', 'RU-BEL': 'Belgorod Oblast', 'RU-BRY': 'Bryansk Oblast',
  'RU-BU': 'Republic of Buryatia', 'RU-CE': 'Chechen Republic', 'RU-CHE': 'Chelyabinsk Oblast',
  'RU-CHU': 'Chukotka Autonomous Okrug', 'RU-CU': 'Chuvash Republic', 'RU-DA': 'Republic of Dagestan',
  'RU-IN': 'Republic of Ingushetia', 'RU-IRK': 'Irkutsk Oblast', 'RU-IVA': 'Ivanovo Oblast',
  'RU-KAM': 'Kamchatka Krai', 'RU-KB': 'Kabardino-Balkar Republic', 'RU-KC': 'Karachay-Cherkess Republic',
  'RU-KDA': 'Krasnodar Krai', 'RU-KEM': 'Kemerovo Oblast', 'RU-KGD': 'Kaliningrad Oblast',
  'RU-KGN': 'Kurgan Oblast', 'RU-KHA': 'Khabarovsk Krai', 'RU-KHM': 'Khanty-Mansi Autonomous Okrug',
  'RU-KIR': 'Kirov Oblast', 'RU-KK': 'Republic of Khakassia', 'RU-KL': 'Republic of Kalmykia',
  'RU-KLU': 'Kaluga Oblast', 'RU-KO': 'Komi Republic', 'RU-KOS': 'Kostroma Oblast',
  'RU-KR': 'Republic of Karelia', 'RU-KRS': 'Kursk Oblast', 'RU-KYA': 'Krasnoyarsk Krai',
  'RU-LEN': 'Leningrad Oblast', 'RU-LIP': 'Lipetsk Oblast', 'RU-MAG': 'Magadan Oblast',
  'RU-ME': 'Mari El Republic', 'RU-MO': 'Republic of Mordovia', 'RU-MOS': 'Moscow Oblast',
  'RU-MOW': 'Moscow', 'RU-MUR': 'Murmansk Oblast', 'RU-NEN': 'Nenets Autonomous Okrug',
  'RU-NGR': 'Novgorod Oblast', 'RU-NIZ': 'Nizhny Novgorod Oblast', 'RU-NVS': 'Novosibirsk Oblast',
  'RU-OMS': 'Omsk Oblast', 'RU-ORE': 'Orenburg Oblast', 'RU-ORL': 'Oryol Oblast',
  'RU-PER': 'Perm Krai', 'RU-PNZ': 'Penza Oblast', 'RU-PRI': 'Primorsky Krai',
  'RU-PSK': 'Pskov Oblast', 'RU-ROS': 'Rostov Oblast', 'RU-RYA': 'Ryazan Oblast',
  'RU-SA': 'Sakha Republic', 'RU-SAK': 'Sakhalin Oblast', 'RU-SAM': 'Samara Oblast',
  'RU-SAR': 'Saratov Oblast', 'RU-SE': 'Republic of North Ossetia-Alania', 'RU-SMO': 'Smolensk Oblast',
  'RU-SPE': 'Saint Petersburg', 'RU-STA': 'Stavropol Krai', 'RU-SVE': 'Sverdlovsk Oblast',
  'RU-TA': 'Republic of Tatarstan', 'RU-TAM': 'Tambov Oblast', 'RU-TOM': 'Tomsk Oblast',
  'RU-TUL': 'Tula Oblast', 'RU-TVE': 'Tver Oblast', 'RU-TY': 'Republic of Tuva',
  'RU-TYU': 'Tyumen Oblast', 'RU-UD': 'Udmurt Republic', 'RU-ULY': 'Ulyanovsk Oblast',
  'RU-VGG': 'Volgograd Oblast', 'RU-VLA': 'Vladimir Oblast', 'RU-VLG': 'Vologda Oblast',
  'RU-VOR': 'Voronezh Oblast', 'RU-YAN': 'Yamalo-Nenets Autonomous Okrug', 'RU-YAR': 'Yaroslavl Oblast',
  'RU-YEV': 'Jewish Autonomous Oblast', 'RU-ZAB': 'Zabaykalsky Krai',
  'PT-13': 'Porto', 'PT-12': 'Portalegre', 'PT-11': 'Lisbon', 'PT-10': 'Leiria',
  'PT-08': 'Faro', 'PT-09': 'Guarda', 'PT-15': 'Setubal', 'PT-14': 'Santarem',
  'PT-04': 'Braganca', 'PT-05': 'Castelo Branco', 'PT-06': 'Coimbra', 'PT-07': 'Evora',
  'PT-01': 'Aveiro', 'PT-02': 'Beja', 'PT-03': 'Braga', 'PT-20': 'Azores',
  'PT-18': 'Viseu', 'PT-17': 'Vila Real', 'PT-30': 'Madeira', 'PT-16': 'Viana do Castelo',
  'BR-SP': 'Sao Paulo', 'BR-RJ': 'Rio de Janeiro',
  'CO-DC': 'Bogota Capital District', 'CL-RM': 'Santiago Metropolitan Region',
};

const PORTUGUESE_ALIASES: Record<string, string[]> = {
  'PT-20': ['regiao autonoma dos acores', 'região autónoma dos açores', 'acores', 'açores', 'azores'],
  'PT-30': ['regiao autonoma da madeira', 'região autónoma da madeira', 'madeira'],
};

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function shortEnglishName(name: string): string | null {
  const short = name
    .replace(/\s+Autonomous Okrug$/i, '')
    .replace(/\s+Oblast$/i, '')
    .replace(/\s+Krai$/i, '')
    .replace(/^Republic of\s+/i, '')
    .replace(/\s+Republic$/i, '')
    .replace(/\s+Metropolitan Region$/i, '')
    .replace(/\s+Capital District$/i, '')
    .trim();
  return short !== name && short.length > 1 ? short : null;
}

function makeCountry(countryCode: string): SubdivisionDef[] {
  const country = data[countryCode];
  if (!country?.sub) return [];

  return Object.entries(country.sub).map(([fullCode, subdivision]) => {
    const code = fullCode.slice(countryCode.length + 1);
    const name = ENGLISH_NAMES[fullCode] ?? subdivision.name;
    const shortName = shortEnglishName(name);
    const aliases = [...new Set([
      name,
      shortName,
      subdivision.name,
      stripDiacritics(name),
      ...(PORTUGUESE_ALIASES[fullCode] ?? []),
      ...(SUBDIVISION_ALIASES[fullCode] ?? []),
    ].filter((alias): alias is string => Boolean(alias)).map((alias) => stripDiacritics(alias).toLowerCase().trim()).filter(Boolean))];
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

export function subdivisionsForCountry(countryCode: string): SubdivisionDef[] {
  const code = countryCode.toUpperCase();
  return SUBDIVISIONS[code] ?? makeCountry(code);
}

export function normalizeSubdivisionCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  const dash = upper.indexOf('-');
  return dash >= 0 ? upper.slice(dash + 1) : upper;
}

export function resolveSubdivision(countryCode: string, input: string): SubdivisionDef | null {
  const normalized = stripDiacritics(input).toLowerCase().trim();
  const normalizedCode = normalizeSubdivisionCode(input)?.toLowerCase();
  const subdivisions = subdivisionsForCountry(countryCode);
  return subdivisions.find((subdivision) =>
    stripDiacritics(subdivision.name).toLowerCase().trim() === normalized,
  ) ?? subdivisions.find((subdivision) =>
    subdivision.code.toLowerCase() === normalized || subdivision.code.toLowerCase() === normalizedCode || subdivision.aliases.includes(normalized),
  ) ?? null;
}
