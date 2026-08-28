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

const EXTRA_SUBDIVISIONS: Record<string, Array<{ code: string; name: string }>> = {
  AU: [
    { code: 'CC', name: 'Cocos Islands' }, { code: 'CX', name: 'Christmas Island' },
    { code: 'JBT', name: 'Jervis Bay Territory' },
  ],
  CL: [{ code: 'NB', name: 'Ñuble' }],
  IN: [{ code: 'DH', name: 'Dadra and Nagar Haveli and Daman and Diu' }],
  ID: [
    { code: 'PD', name: 'Papua Barat Daya' }, { code: 'PE', name: 'Papua Pegunungan' },
    { code: 'PS', name: 'Papua Selatan' }, { code: 'PT', name: 'Papua Tengah' },
  ],
  KZ: [
    { code: 'ABA', name: 'Abai' }, { code: 'ZHE', name: 'Jetisu' }, { code: 'SHY', name: 'Shymkent' },
    { code: 'TUR', name: 'Turkistan' }, { code: 'ULY', name: 'Ulytau' },
  ],
  PH: [{ code: '18', name: 'Negros Island Region' }],
};

const GREENLAND_SUBDIVISIONS: SubdivisionDef[] = [
  { code: 'AV', name: 'Avannaata', aliases: ['avannaata', 'avannaata kommunia'] },
  { code: 'KU', name: 'Kujalleq', aliases: ['kujalleq', 'kommune kujalleq'] },
  { code: 'QE', name: 'Qeqqata', aliases: ['qeqqata', 'qeqqata kommunia'] },
  { code: 'QT', name: 'Qeqertalik', aliases: ['qeqertalik', 'kommune qeqertalik'] },
  { code: 'SM', name: 'Sermersooq', aliases: ['sermersooq', 'kommuneqarfik sermersooq'] },
];

const NORWAY_SUBDIVISIONS: SubdivisionDef[] = [
  { code: '42', name: 'Agder', aliases: ['agder', 'ag'] },
  { code: '32', name: 'Akershus', aliases: ['akershus', 'ak', 'ash', 'as'] },
  { code: '33', name: 'Buskerud', aliases: ['buskerud', 'bus', 'bu'] },
  { code: '56', name: 'Finnmark', aliases: ['finnmark', 'fi'] },
  { code: '34', name: 'Innlandet', aliases: ['innlandet', 'inn', 'in', 'il'] },
  { code: '22', name: 'Jan Mayen', aliases: ['jan mayen', 'jan', 'jm'] },
  { code: '15', name: 'More og Romsdal', aliases: ['more og romsdal', 'møre og romsdal', 'mor', 'mo', 'mr'] },
  { code: '18', name: 'Nordland', aliases: ['nordland', 'no', 'nl'] },
  { code: '03', name: 'Oslo', aliases: ['oslo', 'os'] },
  { code: '11', name: 'Rogaland', aliases: ['rogaland', 'ro', 'rl'] },
  { code: '21', name: 'Svalbard', aliases: ['svalbard', 'sv', 'sp', 'sb'] },
  { code: '40', name: 'Telemark', aliases: ['telemark', 'te'] },
  { code: '55', name: 'Troms', aliases: ['troms', 'ts'] },
  { code: '50', name: 'Trondelag', aliases: ['trondelag', 'trøndelag', 'tg'] },
  { code: '38', name: 'Vestfold', aliases: ['vestfold', 'vf'] },
  { code: '46', name: 'Vestland', aliases: ['vestland', 've', 'vl'] },
  { code: '31', name: 'Ostfold', aliases: ['ostfold', 'østfold', 'øst', 'ost', 'øf', 'of'] },
];

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
  const extras = EXTRA_SUBDIVISIONS[countryCode] ?? [];
  if (!country?.sub) {
    return extras.map(({ code, name }) => ({
      code,
      name,
      aliases: [name, ...(SUBDIVISION_ALIASES[`${countryCode}-${code}`] ?? [])]
        .map((alias) => stripDiacritics(alias).toLowerCase().trim()),
    }));
  }

  const subdivisions = Object.entries(country.sub).map(([fullCode, subdivision]) => {
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
  return [...subdivisions, ...extras.map(({ code, name }) => ({
    code,
    name,
    aliases: [...new Set([name, ...(SUBDIVISION_ALIASES[`${countryCode}-${code}`] ?? [])]
      .map((alias) => stripDiacritics(alias).toLowerCase().trim()).filter(Boolean))],
  }))];
}

/** Complete ISO 3166-2 first-level subdivision data for supported country maps. */
export const SUBDIVISIONS: Record<string, SubdivisionDef[]> = {
  AT: makeCountry('AT'),
  PT: makeCountry('PT'),
  AR: makeCountry('AR'),
  AU: makeCountry('AU'),
  BR: makeCountry('BR'),
  CA: makeCountry('CA'),
  CL: makeCountry('CL'),
  CO: makeCountry('CO'),
  GL: GREENLAND_SUBDIVISIONS,
  GR: makeCountry('GR'),
  IN: makeCountry('IN'),
  ID: makeCountry('ID'),
  IT: makeCountry('IT'),
  JP: makeCountry('JP'),
  KZ: makeCountry('KZ'),
  NO: NORWAY_SUBDIVISIONS,
  PE: makeCountry('PE'),
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
