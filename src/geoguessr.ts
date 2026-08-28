export interface RoundInfo {
  lat: number;
  lng: number;
  panoId: string | null;
  heading: number;
  pitch: number;
  /** GeoGuessr zoom factor (0 = base). FOV scales by ~0.9^zoom. */
  zoom: number;
}

export interface GameState {
  token: string;
  /** Current round counter reported by GeoGuessr (1-based). */
  round: number;
  map: string;
  mapName?: string;
  state?: string;
  rounds: RoundInfo[];
}

/**
 * GeoGuessr now returns pano IDs hex-encoded (e.g. "5F726B..." -> "_rkzErNB5HJl2bG7-_D2LA").
 * Decode them so Google's tile/cbk endpoints get the real pano id.
 */
export function decodePanoId(panoId: string | null): string | null {
  if (!panoId) return null;
  // Hex-encoded (e.g. "5F726B..." -> "_rkzErNB5HJl2bG7-_D2LA").
  if (/^[0-9a-fA-F]{30,64}$/.test(panoId)) {
    try {
      const decoded = Buffer.from(panoId, 'hex').toString('ascii');
      if (/^[\x20-\x7E]+$/.test(decoded)) return decoded;
    } catch {
      // fall through
    }
  }
  // Long base64 protobuf token (e.g. famous-places) — a normal pano id is embedded as text.
  if (panoId.length > 64 && /^[A-Za-z0-9+/=_-]+$/.test(panoId)) {
    try {
      const raw = Buffer.from(panoId, 'base64');
      const text = raw.toString('latin1');
      const match = text.match(/[A-Za-z0-9_-]{22}/);
      if (match) return match[0];
    } catch {
      // fall through
    }
  }
  return panoId;
}

/** True for pano ids that are usable by Google's tile/metadata endpoints (normal 22-char ids). */
export function isUsablePanoId(panoId: string | null): panoId is string {
  return typeof panoId === 'string' && panoId.length <= 64;
}

export class GeoGuessrError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'GeoGuessrError';
  }
}

export interface IGeoGuessrClient {
  /** Create a game and consume round 1 so a playable location is exposed. */
  startGame(mapId: string): Promise<GameState>;
  /** Consume the current round and return the refreshed game (auto-creates a new game at the round limit). */
  nextRound(game: GameState): Promise<GameState>;
}

const API_BASE = 'https://www.geoguessr.com/api/v3';

/**
 * Client for GeoGuessr's unofficial v3 API, authenticated with the `_ncfa` session cookie
 * of a dedicated account. Games are created with NMPZ settings.
 */
export class GeoGuessrClient implements IGeoGuessrClient {
  constructor(
    private readonly ncfa: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Cookie: `_ncfa=${this.ncfa}`,
    };
  }

  private async request(method: string, url: string, body?: unknown): Promise<any> {
    const res = await this.fetchFn(url, {
      method,
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new GeoGuessrError(
        `GeoGuessr API ${method} ${url} failed with HTTP ${res.status}: ${text.slice(0, 200)}`,
        res.status,
      );
    }
    return res.json();
  }

  async createGame(mapId: string): Promise<GameState> {
    const raw = await this.request('POST', `${API_BASE}/games`, {
      map: mapId,
      type: 'standard',
      timeLimit: 0,
      forbidMoving: true,
      forbidZooming: true,
      forbidRotating: true,
    });
    return normalizeGame(raw);
  }

  /** Submit a dummy guess at (0,0) to consume the current round, then fetch the refreshed game. */
  private async submitDummyGuess(game: GameState): Promise<GameState> {
    await this.request('POST', `${API_BASE}/games/${game.token}`, {
      token: game.token,
      lat: 0,
      lng: 0,
      timedOut: false,
      stepsCount: 0,
    });
    return normalizeGame(await this.request('GET', `${API_BASE}/games/${game.token}`));
  }

  async startGame(mapId: string): Promise<GameState> {
    const game = await this.createGame(mapId);
    return this.submitDummyGuess(game);
  }

  async nextRound(game: GameState): Promise<GameState> {
    let g = game;
    // Use rounds 1-4 of each game, then start a fresh one (streak continues across games).
    if (g.round >= 5 || g.state === 'finished') {
      g = await this.createGame(g.map);
    }
    return this.submitDummyGuess(g);
  }

  /** Verify a map exists and get its canonical name by scraping the map page's og:title. */
  async getMapName(mapId: string): Promise<string | null> {
    // The /api/v3/maps and /api/v4/maps endpoints 404 for community maps like A Community World;
    // the public map page is the reliable source of the name.
    try {
      const res = await this.fetchFn(`https://www.geoguessr.com/maps/${mapId}`, {
        headers: this.headers,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const html = await res.text();
      const og = html.match(/property="og:title" content="([^"]*)"/)?.[1];
      if (!og) return null;
      return og.replace(/\s*-\s*Map\s*-\s*GeoGuessr\s*$/i, '') || null;
    } catch {
      return null;
    }
  }
}

function normalizeGame(raw: any): GameState {
  return {
    token: raw.token,
    round: raw.round,
    map: raw.map,
    mapName: raw.mapName,
    state: raw.state,
    rounds: (raw.rounds ?? []).map((r: any) => ({
      lat: r.lat,
      lng: r.lng,
      panoId: decodePanoId(r.panoId ?? null),
      heading: r.heading ?? 0,
      pitch: r.pitch ?? 0,
      zoom: r.zoom ?? 0,
    })),
  };
}

/**
 * The location players should guess on. The bot has already consumed this round
 * with a dummy guess, so the playable index is `round - 2`.
 */
export function playableRound(game: GameState): RoundInfo {
  const round = game.rounds[game.round - 2];
  if (!round) {
    throw new GeoGuessrError(`Game ${game.token} has no playable round at index ${game.round - 2}`);
  }
  return round;
}

/** Google Maps link to the round's location (for result embeds). */
export function roundMapsLink(round: RoundInfo): string {
  return round.panoId
    ? `https://www.google.com/maps/@?api=1&map_action=pano&pano=${encodeURIComponent(round.panoId)}`
    : `https://www.google.com/maps?q=${round.lat},${round.lng}`;
}
