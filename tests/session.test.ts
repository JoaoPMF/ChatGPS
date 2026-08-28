import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../src/config.js';
import { BotDb } from '../src/db.js';
import type { IGeocoder } from '../src/geocode.js';
import type { GameState, IGeoGuessrClient, RoundInfo } from '../src/geoguessr.js';
import { GameSession, type RoundResolvedInfo, type RoundStartedInfo } from '../src/gameManager.js';

const FR_ROUND: RoundInfo = { lat: 48.85, lng: 2.35, panoId: 'pano-fr', heading: 0, pitch: 0 };
const ES_ROUND: RoundInfo = { lat: 40.41, lng: -3.7, panoId: 'pano-es', heading: 0, pitch: 0 };

function makeGame(token: string, round: number): GameState {
  return { token, round, map: 'acw', mapName: 'A Community World', rounds: [FR_ROUND, ES_ROUND, ES_ROUND, ES_ROUND, ES_ROUND] };
}

/** startGame → round 2 (playable: FR). nextRound → round 3 (playable: ES), then stays. */
function makeClient(): IGeoGuessrClient {
  return {
    startGame: vi.fn(async () => makeGame('g1', 2)),
    nextRound: vi.fn(async (game: GameState) => makeGame(game.token, Math.min(game.round + 1, 3))),
  };
}

const geocoder: IGeocoder = {
  countryAt: async (lat: number) => (lat > 45 ? { code: 'FR', name: 'France' } : { code: 'ES', name: 'Spain' }),
};

interface Collected {
  started: RoundStartedInfo[];
  resolved: RoundResolvedInfo[];
  errors: string[];
}

function makeSession(db: BotDb, collected: Collected, rng?: () => number): GameSession {
  return new GameSession({
    channelId: 'chan-1',
    client: makeClient(),
    geocoder,
    db,
    rng,
    imageProvider: async () => null,
    events: {
      roundStarted: (info) => {
        collected.started.push(info);
      },
      roundResolved: (info) => {
        collected.resolved.push(info);
      },
      error: (info) => {
        collected.errors.push(info.message);
      },
    },
  });
}

describe('GameSession', () => {
  let db: BotDb;
  let collected: Collected;

  beforeEach(() => {
    vi.useFakeTimers();
    db = new BotDb(':memory:');
    collected = { started: [], resolved: [], errors: [] };
  });

  afterEach(() => {
    db.close();
    vi.useRealTimers();
  });

  it('starts a game and announces the first round', async () => {
    const session = makeSession(db, collected);
    await session.startNewGame();
    expect(collected.started).toHaveLength(1);
    expect(collected.started[0]).toMatchObject({ streak: 0, mapName: 'A Community World', roundNumber: 1 });
    expect(session.getStatus().phase).toBe('open');
  });

  it('!i resolves instantly without waiting for the timer', async () => {
    const session = makeSession(db, collected);
    await session.startNewGame();

    const result = await session.instantVote('u1', 'france');
    expect(result.ok).toBe(true);
    // resolved immediately, no timer wait
    expect(collected.resolved).toHaveLength(1);
    expect(collected.resolved[0].winningName).toBe('France');
    expect(collected.resolved[0].isCorrect).toBe(true);
  });

  it('!i does not emit the timer-start voteAccepted event', async () => {
    const voteEvents: string[] = [];
    const session = new GameSession({
      channelId: 'chan-1',
      client: makeClient(),
      geocoder,
      db,
      imageProvider: async () => null,
      events: {
        voteAccepted: (info) => {
          voteEvents.push(info.countryName);
        },
      },
    });
    await session.startNewGame();

    await session.instantVote('u1', 'france');
    expect(voteEvents).toHaveLength(0); // suppressed

    // a normal !g after still emits
    session.registerVote('u2', 'spain');
    expect(voteEvents).toContain('Spain');
  });

  it('!g cancel removes the vote and stops a pending resolution', async () => {
    const session = makeSession(db, collected);
    await session.startNewGame();

    session.registerVote('u1', 'france');
    expect(session.cancelVote('u1')).toBe(true);
    expect(session.cancelVote('u2')).toBe(false); // nothing to cancel

    // no votes left → timer expiry resolves nothing
    await vi.advanceTimersByTimeAsync(CONFIG.voteWindowMs + 1);
    expect(collected.resolved).toHaveLength(0);
  });

  it('resolves a correct majority vote, bumps the streak and awards XP', async () => {
    const session = makeSession(db, collected);
    await session.startNewGame();

    expect(session.registerVote('u1', 'france').ok).toBe(true);
    expect(session.registerVote('u2', 'spain').ok).toBe(true);
    // guess changing: u2 switches to france
    const changed = session.registerVote('u2', 'france');
    expect(changed).toMatchObject({ ok: true, changed: true });

    await vi.advanceTimersByTimeAsync(CONFIG.voteWindowMs + 1);

    expect(collected.resolved).toHaveLength(1);
    const result = collected.resolved[0];
    expect(result.isCorrect).toBe(true);
    expect(result.winningName).toBe('France');
    expect(result.actualName).toBe('France');
    expect(result.streak).toBe(1);
    // both voters end on FR → participation + correct
    expect(result.awards.get('u1')).toBe(CONFIG.xp.participation + CONFIG.xp.correct);
    expect(result.awards.get('u2')).toBe(CONFIG.xp.participation + CONFIG.xp.correct);

    expect(db.getUser('u1').xp).toBe(CONFIG.xp.participation + CONFIG.xp.correct);
    // next round was announced
    expect(collected.started).toHaveLength(2);
    expect(collected.started[1].streak).toBe(1);
  });

  it('resets the streak on a wrong answer and records it in the leaderboard', async () => {
    const session = makeSession(db, collected);
    await session.startNewGame();

    session.registerVote('u1', 'france');
    await vi.advanceTimersByTimeAsync(CONFIG.voteWindowMs + 1); // round 1 correct → streak 1

    // round 2 is Spain; vote Germany → wrong
    session.registerVote('u1', 'germany');
    await vi.advanceTimersByTimeAsync(CONFIG.voteWindowMs + 1);

    expect(collected.resolved).toHaveLength(2);
    const result = collected.resolved[1];
    expect(result.isCorrect).toBe(false);
    expect(result.streak).toBe(0);
    expect(result.endedStreak).toBe(1);
    expect(result.actualName).toBe('Spain');

    const top = db.topStreaks(10);
    expect(top).toHaveLength(1);
    expect(top[0].number).toBe(1);
    expect(top[0].endTs).not.toBeNull();
  });

  it('!time extends the window and is capped at the configured maximum', async () => {
    const session = makeSession(db, collected);
    await session.startNewGame();

    // no active vote yet
    expect(session.extendTime('u1').ok).toBe(false);

    session.registerVote('u1', 'france');
    vi.advanceTimersByTime(5_000);

    const ext = session.extendTime('u2');
    expect(ext.ok).toBe(true);
    expect(ext.remainingMs).toBe(CONFIG.voteWindowMs - 5_000 + CONFIG.timeExtensionMs);

    expect(session.extendTime('u2').ok).toBe(true);
    expect(session.extendTime('u2').ok).toBe(true);
    const fourth = session.extendTime('u2');
    expect(fourth.ok).toBe(false);
    expect(fourth.reason).toBe('max-extensions');

    // window has not expired yet at the original deadline + all extensions - 1ms
    const total = CONFIG.voteWindowMs - 5_000 + 3 * CONFIG.timeExtensionMs;
    await vi.advanceTimersByTimeAsync(total - 1);
    expect(collected.resolved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(collected.resolved).toHaveLength(1);
    expect(collected.resolved[0].isCorrect).toBe(true);
  });

  it('applies the tie-break: earliest first vote wins', async () => {
    const session = makeSession(db, collected);
    await session.startNewGame();

    session.registerVote('u1', 'france'); // FR first
    vi.advanceTimersByTime(100);
    session.registerVote('u2', 'spain');
    vi.advanceTimersByTime(100);
    session.registerVote('u3', 'spain'); // ES now leads 2-1
    vi.advanceTimersByTime(100);
    session.registerVote('u4', 'france'); // 2-2 tie → FR was cast first

    await vi.advanceTimersByTimeAsync(CONFIG.voteWindowMs + 200);
    expect(collected.resolved[0].winningName).toBe('France');
    expect(collected.resolved[0].isCorrect).toBe(true);
  });

  it('handles "or" guesses with the injected rng', async () => {
    const session = makeSession(db, collected, () => 0.99); // always last option
    await session.startNewGame();

    const result = session.registerVote('u1', 'germany or france');
    expect(result).toMatchObject({ ok: true, countryName: 'France' });

    await vi.advanceTimersByTimeAsync(CONFIG.voteWindowMs + 1);
    expect(collected.resolved[0].winningName).toBe('France');
    expect(collected.resolved[0].isCorrect).toBe(true);
  });

  it('rejects unknown countries without starting the timer', async () => {
    const session = makeSession(db, collected);
    await session.startNewGame();

    expect(session.registerVote('u1', 'atlantis')).toEqual({ ok: false, reason: 'unknown-country' });
    await vi.advanceTimersByTimeAsync(CONFIG.voteWindowMs * 5);
    expect(collected.resolved).toHaveLength(0);
  });

  it('restores from persisted state', async () => {
    const session = makeSession(db, collected);
    await session.startNewGame();
    session.registerVote('u1', 'france');
    await vi.advanceTimersByTimeAsync(CONFIG.voteWindowMs + 1); // streak → 1
    expect(collected.resolved[0].streak).toBe(1);

    const saved = db.loadGameState('chan-1');
    expect(saved).not.toBeNull();
    expect(saved!.streak).toBe(1);

    const restored = makeSession(db, collected);
    await restored.restore(saved!);
    expect(restored.getStatus().streak).toBe(1);
    expect(restored.getStatus().phase).toBe('open');
  });
});
