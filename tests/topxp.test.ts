import { describe, expect, it } from 'vitest';
import { BotDb } from '../src/db.js';

describe('XP leaderboard', () => {
  it('orders users by XP and includes only users with XP', () => {
    const db = new BotDb(':memory:');
    db.addXp('low', 25);
    db.addXp('high', 100);
    db.addXp('middle', 50);
    db.recordVote('empty', false);

    expect(db.topXp(10)).toEqual([
      { userId: 'high', xp: 100 },
      { userId: 'middle', xp: 50 },
      { userId: 'low', xp: 25 },
    ]);
    db.close();
  });

  it('uses a stable order for equal XP', () => {
    const db = new BotDb(':memory:');
    db.addXp('z-user', 50);
    db.addXp('a-user', 50);
    expect(db.topXp(10).map((row) => row.userId)).toEqual(['a-user', 'z-user']);
    db.close();
  });
});
