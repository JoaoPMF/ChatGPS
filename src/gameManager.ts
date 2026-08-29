import { CONFIG, DEFAULT_MAP, findMap, type MapDef } from './config.js';
import { resolveCountry } from './countries.js';
import { normalizeSubdivisionCode, resolveSubdivision } from './data/subdivisions.js';
import type { BotDb, SavedGameState } from './db.js';
import type { GeoResult, IGeocoder } from './geocode.js';
import {
  playableRound,
  roundMapsLink,
  type GameState,
  type IGeoGuessrClient,
  type RoundInfo,
} from './geoguessr.js';
import { chooseFromInput, pickWinner, pickWinningSubdivision, tallyVotes, type CastVote, type WinnerInfo } from './votes.js';
import { computeXpAwards } from './xp.js';
import { distanceMeters, parseCoordinates } from './hedge.js';
import { renderHedgeMap } from './hedgeMap.js';
import { renderResultMap } from './resultMap.js';

export type Phase = 'loading' | 'open' | 'resolving';

export type ImageProvider = (round: RoundInfo) => Promise<Buffer | null>;

type AnswerMode = 'country' | 'subdivision';

export interface RoundStartedInfo {
  streak: number;
  mapName: string;
  roundNumber: number;
  image: Buffer | null;
  mode: AnswerMode;
  countryCode: string | null;
}

export interface VoteAcceptedInfo {
  userId: string;
  code: string;
  countryName: string;
  subdivisionName?: string;
  /** Present when the input used `or` and was randomly picked. */
  options?: string[];
  /** True when the user changed their previous vote. */
  changed: boolean;
  /** True for the first vote of the round (starts the timer). */
  firstVote: boolean;
  deadline: number | null;
}

export interface RoundResolvedInfo {
  isCorrect: boolean;
  skipped: boolean;
  mode: AnswerMode;
  actualName: string | null;
  actualCode: string | null;
  actualCountryName: string | null;
  actualCountryCode: string | null;
  actualSubdivision: string | null;
  actualSubdivisionDetail: string | null;
  winningName: string | null;
  tally: WinnerInfo[];
  /** Streak after this round. */
  streak: number;
  /** Streak before this round (meaningful when it reset). */
  endedStreak: number;
  milestone: boolean;
  /** Users who guessed the optional subdivision correctly in country mode. */
  subdivisionBonusUsers?: string[];
  awards: ReadonlyMap<string, number>;
  mapsLink: string | null;
  /** Distance for an instant /w guess, when this round was resolved by /w. */
  hedgeDistanceMeters?: number;
  /** Map image comparing a successful hedge guess to the actual round location. */
  hedgeMap?: Buffer;
  /** Country/subdivision map image with highlighted actual (green) and guessed (red) regions. */
  resultMap?: Buffer;
}

export interface SessionEvents {
  roundStarted?(info: RoundStartedInfo): void | Promise<void>;
  voteAccepted?(info: VoteAcceptedInfo): void | Promise<void>;
  timerExtended?(info: { userId: string; remainingMs: number; extensionsLeft: number }): void | Promise<void>;
  roundResolved?(info: RoundResolvedInfo): void | Promise<void>;
  error?(info: { message: string }): void | Promise<void>;
}

export interface SessionDeps {
  channelId: string;
  client: IGeoGuessrClient;
  geocoder: IGeocoder;
  db: BotDb;
  events: SessionEvents;
  imageProvider?: ImageProvider;
  resultMapProvider?: (opts: import('./resultMap.js').ResultMapOptions) => Promise<Buffer | null>;
  rng?: () => number;
  now?: () => number;
  mapId?: string;
  mapName?: string;
}

export type VoteResult =
  | { ok: true; changed: boolean; code: string; countryName: string }
  | { ok: false; reason: 'not-open' | 'unknown-country' };

export interface ExtendResult {
  ok: boolean;
  reason?: 'no-active-vote' | 'max-extensions';
  remainingMs?: number;
  extensionsLeft?: number;
}

export type HedgeGuessResult =
  | {
      ok: true;
      distanceMeters: number;
      lat: number;
      lng: number;
      actualLat: number;
      actualLng: number;
      isFiveK: boolean;
      actualCountryCode: string | null;
      actualCountryName: string | null;
      actualSubdivision: string | null;
    }
  | { ok: false; reason: 'invalid-coordinates' | 'unrecognized-location' | 'no-round' | 'already-guessed' };

/** Per-channel game state machine. All GeoGuessr/geocoding/image dependencies are injected. */
export class GameSession {
  phase: Phase = 'loading';
  streak = 0;
  mapId: string;
  mapName: string;
  mode: AnswerMode;
  countryCode: string | null;
  roundNumber = 0;

  private game: GameState | null = null;
  private current: RoundInfo | null = null;
  private readonly votes = new Map<string, CastVote>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline: number | null = null;
  private hedgeDistanceForResult: number | null = null;
  private hedgeMapForResult: Buffer | null = null;
  private extensionsUsed = 0;
  private streakId: number | null = null;
  private actualPromise: Promise<GeoResult | null> | null = null;
  private imagePromise: Promise<Buffer | null> | null = null;
  private readonly rng: () => number;
  private readonly nowFn: () => number;
  private readonly hedgeGuesses = new Set<string>();

  constructor(private readonly deps: SessionDeps) {
    this.rng = deps.rng ?? Math.random;
    this.nowFn = deps.now ?? (() => Date.now());
    this.mapId = deps.mapId ?? DEFAULT_MAP.id;
    this.mapName = deps.mapName ?? DEFAULT_MAP.name;
    const map = findMap(this.mapId);
    this.mode = map?.mode ?? 'country';
    this.countryCode = map?.countryCode ?? null;
  }

  // ---------- lifecycle ----------

  /** Start a fresh game. Ends the current streak when a different map is requested. */
  async startNewGame(mapId?: string, mapName?: string): Promise<void> {
    this.clearTimer();
    this.phase = 'loading';
    if (mapId) {
      this.mapId = mapId;
      this.mapName = mapName ?? mapId;
      const map = findMap(mapId);
      this.mode = map?.mode ?? 'country';
      this.countryCode = map?.countryCode ?? null;
    }
    this.roundNumber = 0;
    this.game = await this.deps.client.startGame(this.mapId);
    if (this.game.mapName) this.mapName = this.game.mapName;
    await this.beginLocation();
  }

  /** Restore a session from persisted state after a restart. Falls back to a new game. */
  async restore(saved: SavedGameState): Promise<void> {
    try {
      const game = JSON.parse(saved.gameJson) as GameState;
      if (!game || typeof game.round !== 'number' || !game.rounds?.[game.round - 2]) {
        throw new Error('invalid saved game');
      }
      this.game = game;
      this.streak = saved.streak;
      this.streakId = saved.streakId;
      this.mapId = saved.mapId;
      this.mapName = saved.mapName;
      const map = findMap(saved.mapId);
      this.mode = map?.mode ?? 'country';
      this.countryCode = map?.countryCode ?? null;
      this.roundNumber = saved.roundNumber;
      await this.beginLocation();
    } catch {
      await this.startNewGame(saved.mapId, saved.mapName);
    }
  }

  private async beginLocation(): Promise<void> {
    this.current = playableRound(this.game!);
    this.votes.clear();
    this.hedgeGuesses.clear();
    this.extensionsUsed = 0;
    this.deadline = null;
    this.hedgeDistanceForResult = null;
    this.hedgeMapForResult = null;
    this.roundNumber++;
    this.phase = 'open';

    // Prefetch the answer and the panorama in the background.
    this.actualPromise = this.deps.geocoder
      .countryAt(this.current.lat, this.current.lng)
      .catch(() => null);
    this.imagePromise = this.deps.imageProvider
      ? this.deps.imageProvider(this.current).catch(() => null)
      : Promise.resolve(null);

    this.persist();

    const image = await this.imagePromise;
    await this.deps.events.roundStarted?.({
      streak: this.streak,
      mapName: this.mapName,
      roundNumber: this.roundNumber,
      image,
      mode: this.mode,
      countryCode: this.countryCode,
    });
  }

  private async advance(): Promise<void> {
    try {
      this.game = await this.deps.client.nextRound(this.game!);
      await this.beginLocation();
    } catch (err) {
      this.phase = 'open';
      await this.deps.events.error?.({
        message: `Failed to load the next round: ${err instanceof Error ? err.message : String(err)}\nAn admin can use \`!fix\` to start a fresh game.`,
      });
    }
  }

  // ---------- voting ----------

  /** When true, the next registerVote won't emit the voteAccepted (timer-start) event. */
  private suppressVoteEvent = false;

  registerVote(userId: string, input: string): VoteResult {
    if (this.phase !== 'open' || !this.current) {
      return { ok: false, reason: 'not-open' };
    }
    const [countryInput, subdivisionInput] = this.mode === 'country' && input.includes(',')
      ? input.split(/,(.+)/s).map((part) => part.trim())
      : [input, undefined];
    const { chosen, options } = chooseFromInput(countryInput, this.rng);
    const answer = this.mode === 'subdivision' && this.countryCode
      ? resolveSubdivision(this.countryCode, chosen)
      : resolveCountry(chosen);
    if (!answer) {
      return { ok: false, reason: 'unknown-country' };
    }

    const firstVote = this.votes.size === 0;
    const changed = this.votes.has(userId);
    const code = this.mode === 'subdivision' ? answer.code : answer.code;
    const guessedCountry = this.mode === 'country' ? resolveCountry(chosen) : null;
    const guessedSubdivision = subdivisionInput && guessedCountry
      ? resolveSubdivision(guessedCountry.code, subdivisionInput)
      : null;
    this.votes.set(userId, {
      userId,
      code,
      name: answer.name,
      subdivisionCode: guessedSubdivision?.code,
      subdivisionName: guessedSubdivision?.name,
      at: this.nowFn(),
    });
    if (this.streakId !== null) this.deps.db.addParticipantVote(this.streakId, userId);
    if (firstVote) this.startTimer();

    if (!this.suppressVoteEvent) {
      void this.deps.events.voteAccepted?.({
        userId,
        code,
        countryName: answer.name,
        subdivisionName: guessedSubdivision?.name,
        options: options.length > 1 ? options : undefined,
        changed,
        firstVote,
        deadline: this.deadline,
      });
    }
    return { ok: true, changed, code, countryName: answer.name };
  }

  /** `!g cancel` — remove the user's vote. Returns true if a vote was removed. */
  cancelVote(userId: string): boolean {
    if (this.phase !== 'open') return false;
    return this.votes.delete(userId);
  }

  /** Process a `/w` ChatGuessr coordinate guess once per player per round. */
  async submitHedgeGuess(userId: string, input: string): Promise<HedgeGuessResult> {
    if (!this.current || this.phase === 'loading' || this.phase === 'resolving') {
      return { ok: false, reason: 'no-round' };
    }
    if (this.hedgeGuesses.has(userId)) return { ok: false, reason: 'already-guessed' };
    const guess = parseCoordinates(input);
    if (!guess) return { ok: false, reason: 'invalid-coordinates' };
    const actualPosition = { lat: this.current.lat, lng: this.current.lng };

    const distance = distanceMeters(guess, { lat: this.current.lat, lng: this.current.lng });
    const isFiveK = distance <= CONFIG.fiveKDistanceMeters;
    const guessedLocation = await this.deps.geocoder.countryAt(guess.lat, guess.lng).catch(() => null);
    if (!guessedLocation) return { ok: false, reason: 'unrecognized-location' };

    const voteInput = this.mode === 'subdivision'
      ? guessedLocation.subdivisionCode ?? guessedLocation.subdivision ?? ''
      : `${guessedLocation.name}${guessedLocation.subdivision ? `, ${guessedLocation.subdivision}` : ''}`;
    if (!voteInput) return { ok: false, reason: 'unrecognized-location' };

    this.suppressVoteEvent = true;
    const voteResult = this.registerVote(userId, voteInput);
    this.suppressVoteEvent = false;
    if (!voteResult.ok) return { ok: false, reason: 'unrecognized-location' };

    this.hedgeGuesses.add(userId);
    this.hedgeDistanceForResult = distance;
    this.hedgeMapForResult = await renderHedgeMap(guess, actualPosition).catch(() => null);
    const actual = this.actualPromise ? await this.actualPromise : null;
    this.deps.db.recordHedgeGuess({
      channelId: this.deps.channelId,
      roundNumber: this.roundNumber,
      userId,
      lat: guess.lat,
      lng: guess.lng,
      distanceMeters: distance,
      isFiveK,
    });
    if (isFiveK) this.deps.db.addXp(userId, CONFIG.xp.fiveK);
    await this.resolveRound();
    return {
      ok: true,
      distanceMeters: distance,
      lat: guess.lat,
      lng: guess.lng,
      actualLat: actualPosition.lat,
      actualLng: actualPosition.lng,
      isFiveK,
      actualCountryCode: actual?.code ?? null,
      actualCountryName: actual?.name ?? null,
      actualSubdivision: actual?.subdivision ?? null,
    };
  }

  private startTimer(): void {
    this.deadline = this.nowFn() + CONFIG.voteWindowMs;
    this.timer = setTimeout(() => void this.resolveRound(), CONFIG.voteWindowMs);
  }

  /** `!time` — extend the current voting window. */
  extendTime(userId: string): ExtendResult {
    if (this.phase !== 'open' || !this.timer || this.deadline === null) {
      return { ok: false, reason: 'no-active-vote' };
    }
    if (this.extensionsUsed >= CONFIG.maxTimeExtensions) {
      return { ok: false, reason: 'max-extensions' };
    }
    this.extensionsUsed++;
    const remaining = this.deadline - this.nowFn() + CONFIG.timeExtensionMs;
    clearTimeout(this.timer);
    this.deadline = this.nowFn() + remaining;
    this.timer = setTimeout(() => void this.resolveRound(), remaining);

    void this.deps.events.timerExtended?.({
      userId,
      remainingMs: remaining,
      extensionsLeft: CONFIG.maxTimeExtensions - this.extensionsUsed,
    });
    return { ok: true, remainingMs: remaining, extensionsLeft: CONFIG.maxTimeExtensions - this.extensionsUsed };
  }

  /** `!i` — register a guess and resolve the round immediately, skipping the timer. */
  async instantVote(userId: string, input: string): Promise<VoteResult> {
    this.suppressVoteEvent = true;
    try {
      const result = this.registerVote(userId, input);
      if (result.ok) {
        await this.resolveRound();
      }
      return result;
    } finally {
      this.suppressVoteEvent = false;
    }
  }

  /** Tally votes, check correctness, update streak/XP/DB, then advance. Called when the timer expires. */
  private async resolveRound(): Promise<void> {
    if (this.phase !== 'open' || this.votes.size === 0 || !this.current) return;
    this.phase = 'resolving';
    this.clearTimer();

    const winner = pickWinner(this.votes)!;
    const tally = tallyVotes(this.votes);
    const actual = this.actualPromise ? await this.actualPromise : null;
    const actualAnswerCode = this.mode === 'subdivision'
      ? normalizeSubdivisionCode(actual?.subdivisionCode) ??
        (actual?.subdivision && this.countryCode ? resolveSubdivision(this.countryCode, actual.subdivision)?.code ?? null : null)
      : actual?.code ?? null;
    const actualAnswerName = this.mode === 'subdivision'
      ? (actualAnswerCode && this.countryCode
        ? resolveSubdivision(this.countryCode, actualAnswerCode)?.name ?? actual?.subdivision ?? null
        : actual?.subdivision ?? null)
      : actual?.name ?? null;
    const isCorrect = actualAnswerCode !== null && winner.code.toUpperCase() === actualAnswerCode.toUpperCase();
    const endedStreak = this.streak;
    const roundStreakId = this.streakId;
    let milestone = false;

    if (isCorrect) {
      if (this.streakId === null) {
        this.streakId = this.deps.db.startStreak(this.deps.channelId, this.mapId, this.mapName);
        // Attribute everyone who voted before the streak row existed.
        for (const userId of this.votes.keys()) this.deps.db.addParticipantVote(this.streakId, userId);
      }
      this.streak = this.deps.db.bumpStreak(this.streakId);
      milestone = CONFIG.xp.milestones.includes(this.streak);
    } else {
      if (this.streakId !== null) this.deps.db.endStreak(this.streakId);
      this.streak = 0;
      this.streakId = null;
    }

    // XP and stats
    const finalVotes = new Map([...this.votes].map(([u, v]) => [u, v.code]));
    const subdivisionCorrectUsers = this.mode === 'country' && actual?.subdivisionCode
      ? new Set(
        [...this.votes.values()]
          .filter((vote) => vote.subdivisionCode?.toUpperCase() === normalizeSubdivisionCode(actual.subdivisionCode)?.toUpperCase())
          .map((vote) => vote.userId),
      )
      : new Set<string>();
    const awards = computeXpAwards({
      finalVotes,
      winningCode: winner.code,
      actualCode: actual?.code ?? null,
      isCorrect,
      newStreak: this.streak,
      cfg: CONFIG.xp,
      subdivisionCorrectUsers,
    });
    for (const [userId, amount] of awards) this.deps.db.addXp(userId, amount);
    for (const [userId, code] of finalVotes) {
      this.deps.db.recordVote(userId, isCorrect && code === winner.code);
    }

    const roundId = this.deps.db.logRound({
      streakId: roundStreakId,
      channelId: this.deps.channelId,
      mapId: this.mapId,
      mapName: this.mapName,
      roundNumber: this.roundNumber,
      lat: this.current.lat,
      lng: this.current.lng,
      actualCode: actualAnswerCode,
      actualName: actualAnswerName,
      winningCode: winner.code,
      winningName: winner.name,
      isCorrect,
    });
    for (const [userId, code] of finalVotes) {
      this.deps.db.logUserRound(roundId, userId, isCorrect && code === winner.code);
    }

    this.persist();

    const getResultMap = this.deps.resultMapProvider ?? renderResultMap;
    let resultMap = this.hedgeMapForResult;
    if (!resultMap) {
      const winningSubdivision = this.mode === 'country' ? pickWinningSubdivision(this.votes, winner.code) : null;
      resultMap = await getResultMap({
        mode: this.mode,
        countryCode: this.countryCode,
        actualCode: actualAnswerCode,
        actualName: actualAnswerName,
        actualLat: this.current.lat,
        actualLng: this.current.lng,
        winningCode: winner.code,
        winningName: winner.name,
        winningSubdivisionCode: winningSubdivision?.code ?? null,
        winningSubdivisionName: winningSubdivision?.name ?? null,
        isCorrect,
      }).catch(() => null);
    }

    await this.deps.events.roundResolved?.({
      isCorrect,
      skipped: false,
      mode: this.mode,
      actualName: actualAnswerName,
      actualCode: actualAnswerCode,
      actualCountryName: actual?.name ?? null,
      actualCountryCode: actual?.code ?? null,
      actualSubdivision: actual?.subdivision ?? null,
      actualSubdivisionDetail: actual?.subdivisionDetail ?? null,
      winningName: winner.name,
      tally,
      streak: this.streak,
      endedStreak,
      milestone,
      subdivisionBonusUsers: subdivisionCorrectUsers.size > 0 ? [...subdivisionCorrectUsers] : undefined,
      awards,
      mapsLink: roundMapsLink(this.current),
      hedgeDistanceMeters: this.hedgeDistanceForResult ?? undefined,
      hedgeMap: this.hedgeMapForResult ?? undefined,
      resultMap: resultMap ?? undefined,
    });

    this.hedgeDistanceForResult = null;
    this.hedgeMapForResult = null;
    await this.advance();
  }

  // ---------- admin / utility ----------

  /** Reveal the answer, reset the streak and move on. */
  async skip(): Promise<void> {
    if (this.phase === 'loading' || this.phase === 'resolving' || !this.current) return;
    this.phase = 'resolving';
    this.clearTimer();

    const actual = this.actualPromise ? await this.actualPromise : null;
    const actualAnswerCode = this.mode === 'subdivision'
      ? normalizeSubdivisionCode(actual?.subdivisionCode) ??
        (actual?.subdivision && this.countryCode ? resolveSubdivision(this.countryCode, actual.subdivision)?.code ?? null : null)
      : actual?.code ?? null;
    const actualAnswerName = this.mode === 'subdivision'
      ? actual?.subdivision ?? actualAnswerCode
      : actual?.name ?? null;
    const endedStreak = this.streak;
    if (this.streakId !== null) this.deps.db.endStreak(this.streakId);
    this.streak = 0;
    this.streakId = null;
    this.persist();

    const getResultMap = this.deps.resultMapProvider ?? renderResultMap;
    const resultMap = await getResultMap({
      mode: this.mode,
      countryCode: this.countryCode,
      actualCode: actualAnswerCode,
      actualName: actualAnswerName,
      actualLat: this.current.lat,
      actualLng: this.current.lng,
      isCorrect: false,
    }).catch(() => null);

    await this.deps.events.roundResolved?.({
      isCorrect: false,
      skipped: true,
      mode: this.mode,
      actualName: actualAnswerName,
      actualCode: actualAnswerCode,
      actualCountryName: actual?.name ?? null,
      actualCountryCode: actual?.code ?? null,
      actualSubdivision: actual?.subdivision ?? null,
      actualSubdivisionDetail: actual?.subdivisionDetail ?? null,
      winningName: null,
      tally: [],
      streak: 0,
      endedStreak,
      milestone: false,
      awards: new Map(),
      mapsLink: roundMapsLink(this.current),
      resultMap: resultMap ?? undefined,
    });

    await this.advance();
  }

  /** Switch to another map. Ends the current streak and starts a fresh game. */
  async switchMap(map: MapDef): Promise<void> {
    this.clearTimer();
    if (this.streakId !== null) this.deps.db.endStreak(this.streakId);
    this.streak = 0;
    this.streakId = null;
    try {
      await this.startNewGame(map.id, map.name);
    } catch (err) {
      // The map could not be started — fall back to the default map so the bot never stalls.
      await this.deps.events.error?.({
        message: `Could not start **${map.name}** (${err instanceof Error ? err.message : String(err)}). Falling back to **${DEFAULT_MAP.name}**.`,
      });
      await this.startNewGame(DEFAULT_MAP.id, DEFAULT_MAP.name);
    }
  }

  /** Re-process by starting a fresh game on the current map, keeping the streak. */
  async fix(): Promise<void> {
    const streak = this.streak;
    const streakId = this.streakId;
    await this.startNewGame();
    this.streak = streak;
    this.streakId = streakId;
    this.persist();
  }

  setStreak(n: number): void {
    this.streak = n;
    if (n > 0) {
      if (this.streakId === null) {
        this.streakId = this.deps.db.startStreak(this.deps.channelId, this.mapId, this.mapName);
      }
      this.deps.db.setStreakNumber(this.streakId, n);
    }
    this.persist();
  }

  /** Current round's viewport image (cached). Retries on demand if the initial render failed. */
  async getImage(): Promise<Buffer | null> {
    const cached = this.imagePromise ? await this.imagePromise : null;
    if (cached || !this.deps.imageProvider || !this.current?.panoId || this.phase === 'loading') {
      return cached;
    }
    // The original render failed (or was rejected) — try again on demand.
    this.imagePromise = this.deps.imageProvider(this.current).catch(() => null);
    return this.imagePromise;
  }

  /** `!!pic` — force a fresh render of the current location (bypasses the cache). */
  async rebuildImage(): Promise<Buffer | null> {
    if (!this.deps.imageProvider || !this.current || this.phase === 'loading') return null;
    this.imagePromise = this.deps.imageProvider(this.current).catch(() => null);
    return this.imagePromise;
  }

  /** Current votes for `!votes`. */
  currentVotes(): { userId: string; name: string; code: string; subdivisionName?: string }[] {
    return [...this.votes.values()].map((v) => ({
      userId: v.userId,
      name: v.name,
      code: v.code,
      subdivisionName: v.subdivisionName,
    }));
  }

  getStatus(): { phase: Phase; streak: number; deadline: number | null; votes: number; mapName: string; mode: AnswerMode; countryCode: string | null } {
    return {
      phase: this.phase,
      streak: this.streak,
      deadline: this.deadline,
      votes: this.votes.size,
      mapName: this.mapName,
      mode: this.mode,
      countryCode: this.countryCode,
    };
  }

  // ---------- internals ----------

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
  }

  persist(): void {
    if (!this.game) return;
    this.deps.db.saveGameState({
      channelId: this.deps.channelId,
      gameJson: JSON.stringify(this.game),
      streak: this.streak,
      streakId: this.streakId,
      mapId: this.mapId,
      mapName: this.mapName,
      roundNumber: this.roundNumber,
    });
  }
}

export class SessionManager {
  private readonly sessions = new Map<string, GameSession>();

  constructor(
    private readonly deps: Omit<SessionDeps, 'channelId' | 'events' | 'mapId' | 'mapName'>,
  ) {}

  get(channelId: string): GameSession | undefined {
    return this.sessions.get(channelId);
  }

  /** Start (or restore) the session for a channel. */
  async start(channelId: string, events: SessionEvents): Promise<GameSession> {
    const session = new GameSession({ ...this.deps, channelId, events });
    this.sessions.set(channelId, session);
    const saved = this.deps.db.loadGameState(channelId);
    try {
      if (saved) await session.restore(saved);
      else await session.startNewGame();
    } catch (err) {
      await events.error?.({
        message: `Failed to start the game: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return session;
  }

  persistAll(): void {
    for (const session of this.sessions.values()) session.persist();
  }
}
