/*
 * Custom aliases for guesses.
 *
 * Add aliases in lowercase. Restart the bot after editing this file.
 *
 * Country aliases use ISO 3166-1 alpha-2 country codes:
 *   US: ['murica', 'united states of america'],
 *
 * Subdivision aliases use ISO 3166-2 codes, including the country prefix:
 *   PT-11: ['lx', 'lisbon district'],
 *   US-CA: ['cali'],
 *   RU-MOW: ['moscow city'],
 */

export const COUNTRY_ALIASES: Record<string, string[]> = {
  // Example:
  // PT: ['portugal mainland'],
    AU: ['aus'],
    AR: ['arg'],
    BR: ['bra'],
    CA: ['can'],
};

export const SUBDIVISION_ALIASES: Record<string, string[]> = {
  // Example:
  // 'PT-11': ['lx', 'lisbon district'],
  // 'US-CA': ['cali'],
  // 'RU-MOW': ['moscow city'],
  'PT-20': ['açores'],
};
