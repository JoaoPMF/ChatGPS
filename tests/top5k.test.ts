import { describe, expect, it } from 'vitest';
import { BotDb } from '../src/db.js';

describe('5K leaderboard', () => {
  it('counts only hedge guesses marked as 5K', () => {
    const db = new BotDb(':memory:');
    db.recordHedgeGuess({ channelId: 'c', roundNumber: 1, userId: 'alice', lat: 0, lng: 0, distanceMeters: 50, isFiveK: true });
    db.recordHedgeGuess({ channelId: 'c', roundNumber: 2, userId: 'alice', lat: 0, lng: 1, distanceMeters: 10_000, isFiveK: false });
    db.recordHedgeGuess({ channelId: 'c', roundNumber: 3, userId: 'bob', lat: 1, lng: 1, distanceMeters: 100, isFiveK: true });
    db.recordHedgeGuess({ channelId: 'c', roundNumber: 4, userId: 'alice', lat: 1, lng: 1, distanceMeters: 1, isFiveK: true });

    expect(db.topFiveKs(10)).toEqual([
      { userId: 'alice', fiveKs: 2 },
      { userId: 'bob', fiveKs: 1 },
    ]);
    db.close();
  });
});
