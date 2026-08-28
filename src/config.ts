import 'dotenv/config';

export interface MapDef {
  id: string;
  name: string;
  aliases: string[];
  mode: 'country' | 'subdivision';
  countryCode?: string;
}

/** Maps available for !switchmap. Default is A Community World by MatePotato. */
export const MAPS: MapDef[] = [
  {
    id: '62a44b22040f04bd36e8a914',
    name: 'A Community World',
    aliases: ['acw', 'community world', 'a community world'],
    mode: 'country',
  },
  { id: '643dbc7ccc47d3a344307998', name: 'An Arbitrary Rural World', aliases: ['an arbitrary rural world', 'arbitrary rural', 'aarw'], mode: 'country' },
  { id: '5dbaf08ed0d2a478444d2e8e', name: 'AI Generated World', aliases: ['ai generated world', 'ai gen world', 'ai world', 'aigw'], mode: 'country' },
  { id: '681ab5c4e47c07651a02582b', name: 'Yellow Belly', aliases: ['yellow belly', 'yellowbelly', 'yb'], mode: 'country' },
  { id: '69e756b2c972797e9da88461', name: 'Sidetrek', aliases: ['sidetrek'], mode: 'country' },
  { id: '6089bfcff6a0770001f645dd', name: 'An Arbitrary World', aliases: ['an arbitrary world', 'arbitrary world', 'aaw'], mode: 'country' },
  { id: '5be0de51fe3a84037ca36447', name: 'A Rural World', aliases: ['a rural world', 'rural world', 'rural'], mode: 'country' },
  { id: '6484b2a40404933187c284b2', name: 'A Balanced AI Generated Portugal', aliases: ['portugal', 'balanced portugal'], mode: 'subdivision', countryCode: 'PT' },
  { id: '63a3cef9571dcbb3660427c4', name: 'An Arbitrary Argentina', aliases: ['argentina'], mode: 'subdivision', countryCode: 'AR' },
  { id: '60afb9b2dcdbe60001438fa6', name: 'A Balanced Australia', aliases: ['australia'], mode: 'subdivision', countryCode: 'AU' },
  { id: '61df8477a94f5d0001ef9f2c', name: 'A Balanced Brazil', aliases: ['brazil', 'brasil'], mode: 'subdivision', countryCode: 'BR' },
  { id: '61067f9608061c000157a851', name: 'A Balanced Canada', aliases: ['canada'], mode: 'subdivision', countryCode: 'CA' },
  { id: '6430f6ae803b91d398056286', name: 'A Balanced AI Generated Chile', aliases: ['chile'], mode: 'subdivision', countryCode: 'CL' },
  { id: '63c0a65c985b2d9d2425c6a1', name: 'A Balanced Colombia', aliases: ['colombia'], mode: 'subdivision', countryCode: 'CO' },
  { id: '62e10035c97fc44e29bd8e0e', name: 'A Balanced AI Generated India', aliases: ['india'], mode: 'subdivision', countryCode: 'IN' },
  { id: '619086606e5572000185a1db', name: 'AI gen - Indonesia', aliases: ['indonesia'], mode: 'subdivision', countryCode: 'ID' },
  { id: '6116c51c5e6d8d00011bcd7d', name: 'IntersectionGuessr - Japan', aliases: ['japan'], mode: 'subdivision', countryCode: 'JP' },
  { id: '65fe54b87e03da1378fdf606', name: 'An Arbitrary Kazakhstan', aliases: ['kazakhstan'], mode: 'subdivision', countryCode: 'KZ' },
  { id: '64f4959080229b9a3d429041', name: 'A Balanced Philippines', aliases: ['philippines'], mode: 'subdivision', countryCode: 'PH' },
  { id: '62e309bfac02fca31aa404b8', name: 'A Balanced Russia', aliases: ['russia'], mode: 'subdivision', countryCode: 'RU' },
  { id: '68e2c0daed3df2e627692b0b', name: 'A Balanced South Africa', aliases: ['south africa'], mode: 'subdivision', countryCode: 'ZA' },
  { id: '61dfb63654e4730001e8faf5', name: 'An Arbitrary United States', aliases: ['united states', 'united-states', 'usa states'], mode: 'subdivision', countryCode: 'US' },
];

export const DEFAULT_MAP = MAPS[0];

/** Resolve a user-typed map name/alias/id. Unknown 24-char hex ids are passed through to GeoGuessr. */
export function findMap(input: string): MapDef | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  for (const m of MAPS) {
    if (m.id.toLowerCase() === q || m.name.toLowerCase() === q || m.aliases.includes(q)) return m;
  }
  if (/^[a-f0-9]{24}$/i.test(q)) return { id: q, name: q, aliases: [], mode: 'country' };
  return null;
}

export const CONFIG = {
  prefix: '!',
  /** Voting window that starts when the first player guesses. */
  voteWindowMs: 10_000,
  /** How much !time extends the current vote window. */
  timeExtensionMs: 20_000,
  /** Max number of !time extensions per round (anti-stall). */
  maxTimeExtensions: 3,
  /** Cooldown for !switchmap per channel. */
  switchmapCooldownMs: 30_000,
  /** Maximum distance for a /w guess to count as a 5K. */
  fiveKDistanceMeters: 185,
  xp: {
    /** XP for casting any vote in a round. */
    participation: 5,
    /** Extra XP when your final vote matches a correct winning answer. */
    correct: 25,
    /** Bonus XP to all voters of the round when the streak hits a milestone. */
    milestone: 100,
    /** Bonus XP for a hedge guess within the 5K distance threshold. */
    fiveK: 100,
    milestones: [5, 10, 25, 50, 100] as number[],
  },
} as const;

export const env = {
  discordToken: process.env.DISCORD_TOKEN ?? '',
  ncfa: process.env.NCFA ?? '',
  bigDataCloudKey: process.env.BIGDATACLOUD_API_KEY ?? '',
  allowedChannelIds: (process.env.ALLOWED_CHANNEL_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  dbPath: process.env.DB_PATH ?? 'streaks.db',
  chatguessrMapUrl: process.env.CHATGUESSR_MAP_URL ?? 'https://chatguessr.com/map/PlonkIt',
};

export function requireEnv(): void {
  const missing: string[] = [];
  if (!env.discordToken) missing.push('DISCORD_TOKEN');
  if (!env.ncfa) missing.push('NCFA');
  if (!env.bigDataCloudKey) missing.push('BIGDATACLOUD_API_KEY');
  if (env.allowedChannelIds.length === 0) missing.push('ALLOWED_CHANNEL_IDS');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. See .env.example.`);
  }
}
