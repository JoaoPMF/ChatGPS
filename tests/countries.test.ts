import { describe, expect, it } from 'vitest';
import { nameOf, normalize, resolveCountry, sovereignOf } from '../src/countries.js';
import { resolveSubdivision } from '../src/data/subdivisions.js';

describe('resolveCountry', () => {
  it('resolves canonical names case-insensitively', () => {
    expect(resolveCountry('France')?.code).toBe('FR');
    expect(resolveCountry('germany')?.code).toBe('DE');
    expect(resolveCountry('  JAPAN ')?.code).toBe('JP');
  });

  it('resolves common aliases and abbreviations', () => {
    expect(resolveCountry('usa')?.code).toBe('US');
    expect(resolveCountry('america')?.code).toBe('US');
    expect(resolveCountry('uk')?.code).toBe('GB');
    expect(resolveCountry('britain')?.code).toBe('GB');
    expect(resolveCountry('south korea')?.code).toBe('KR');
    expect(resolveCountry('holland')?.code).toBe('NL');
    expect(resolveCountry('czech republic')?.code).toBe('CZ');
    expect(resolveCountry('turkey')?.code).toBe('TR');
  });

  it('resolves the ISO code itself', () => {
    expect(resolveCountry('fr')?.code).toBe('FR');
    expect(resolveCountry('US')?.code).toBe('US');
  });

  it('handles diacritics and punctuation', () => {
    expect(resolveCountry("cote d'ivoire")?.code).toBe('CI');
    expect(resolveCountry('ivory coast')?.code).toBe('CI');
    expect(resolveCountry('türkiye')?.code).toBe('TR');
  });

  it('disambiguates the Congos', () => {
    expect(resolveCountry('congo')?.code).toBe('CG');
    expect(resolveCountry('drc')?.code).toBe('CD');
    expect(resolveCountry('democratic republic of the congo')?.code).toBe('CD');
  });

  it('returns null for unknown input', () => {
    expect(resolveCountry('atlantis')).toBeNull();
    expect(resolveCountry('')).toBeNull();
  });
});

describe('territory rules', () => {
  it('counts territories as their sovereign states', () => {
    expect(sovereignOf('PR')).toBe('US');
    expect(sovereignOf('GU')).toBe('US');
    expect(sovereignOf('RE')).toBe('FR');
    expect(sovereignOf('GP')).toBe('FR');
    expect(sovereignOf('GI')).toBe('GB');
    expect(sovereignOf('FO')).toBe('DK');
    expect(sovereignOf('GL')).toBe('DK');
    expect(sovereignOf('HK')).toBe('CN');
    expect(sovereignOf('AX')).toBe('FI');
    expect(sovereignOf('SJ')).toBe('NO');
    expect(sovereignOf('CW')).toBe('NL');
  });

  it('leaves sovereign states untouched', () => {
    expect(sovereignOf('FR')).toBe('FR');
    expect(sovereignOf('US')).toBe('US');
  });

  it('nameOf applies the override', () => {
    expect(nameOf('PR')).toBe('United States');
    expect(nameOf('RE')).toBe('France');
    expect(nameOf('FR')).toBe('France');
  });
});

describe('normalize', () => {
  it('strips leading "the"', () => {
    expect(normalize('The Bahamas')).toBe('bahamas');
  });
});

describe('subdivision names and aliases', () => {
  it('displays English names while accepting ISO transliterations', () => {
    expect(resolveSubdivision('RU', 'moscow')?.name).toBe('Moscow');
    expect(resolveSubdivision('RU', 'moskva')?.name).toBe('Moscow');
    expect(resolveSubdivision('RU', "penzenskaja oblast'")?.name).toBe('Penza Oblast');
    expect(resolveSubdivision('RU', 'penza oblast')?.name).toBe('Penza Oblast');
    expect(resolveSubdivision('RU', 'penza')?.name).toBe('Penza Oblast');
    expect(resolveSubdivision('RU', 'krasnoyarsk')?.name).toBe('Krasnoyarsk Krai');
    expect(resolveSubdivision('RU', 'dagestan')?.name).toBe('Republic of Dagestan');
  });

  it('accepts English and local names for Portuguese subdivisions', () => {
    expect(resolveSubdivision('PT', 'lisbon')?.name).toBe('Lisbon');
    expect(resolveSubdivision('PT', 'lisboa')?.name).toBe('Lisbon');
    expect(resolveSubdivision('PT', 'li')?.name).toBe('Lisbon');
    expect(resolveSubdivision('PT', 'leiria')?.name).toBe('Leiria');
    expect(resolveSubdivision('PT', 'vdc')?.name).toBe('Viana do Castelo');
    expect(resolveSubdivision('PT', 'madeira')?.name).toBe('Madeira');
    expect(resolveSubdivision('PT', 'ma')?.name).toBe('Madeira');
    expect(resolveSubdivision('PT', 'região autónoma da madeira')?.name).toBe('Madeira');
    expect(resolveSubdivision('PT', 'PT-30')?.name).toBe('Madeira');
  });

  it('resolves subdivisions outside the dedicated subdivision maps', () => {
    expect(resolveSubdivision('MX', 'tamaulipas')?.code).toBe('TAM');
  });

  it.each([
    ['AU', 'cx', 'CX'], ['CL', 'ñub', 'NB'], ['IN', 'dh', 'DH'], ['ID', 'pbd', 'PD'],
    ['KZ', 'ul', 'ULY'], ['PH', 'neg', '18'], ['US', 'bye', 'HI'], ['RU', 'spb', 'SPE'],
  ])('resolves requested aliases for %s', (countryCode, subdivision, expectedCode) => {
    expect(resolveSubdivision(countryCode, subdivision)?.code).toBe(expectedCode);
  });

  it('uses current Greenland municipalities instead of legacy ISO data', () => {
    expect(resolveSubdivision('GL', 'kommune qeqertalik')?.name).toBe('Qeqertalik');
    expect(resolveSubdivision('GL', 'GL-QT')?.name).toBe('Qeqertalik');
    expect(resolveSubdivision('GL', 'avannaata kommunia')?.name).toBe('Avannaata');
  });

  it.each([
    ['AT', 'bgl', 'Burgenland'],
    ['GR', 'emt', 'Anatolikí Makedonía kai Thráki'],
    ['IT', 'π', 'Piemonte'],
    ['NO', 'øst', 'Ostfold'],
    ['PE', 'mml', 'Lima hatun llaqta'],
  ])('loads subdivision data for %s', (countryCode, subdivision, expectedName) => {
    expect(resolveSubdivision(countryCode, subdivision)?.name).toBe(expectedName);
  });
});
