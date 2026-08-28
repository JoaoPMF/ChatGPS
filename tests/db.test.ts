import { describe, expect, it } from 'vitest';
import { BotDb } from '../src/db.js';

describe('BotDb accuracy', () => {
  it('calculates accuracy from each user vote, including wrong rounds', () => {
    const db = new BotDb(':memory:');
    const first = db.logRound({
      streakId: null,
      channelId: 'channel',
      mapId: 'map-1',
      mapName: 'Test Map',
      roundNumber: 1,
      lat: 0,
      lng: 0,
      actualCode: 'FR',
      actualName: 'France',
      winningCode: 'FR',
      winningName: 'France',
      isCorrect: true,
    });
    const second = db.logRound({
      streakId: null,
      channelId: 'channel',
      mapId: 'map-1',
      mapName: 'Test Map',
      roundNumber: 2,
      lat: 0,
      lng: 0,
      actualCode: 'DE',
      actualName: 'Germany',
      winningCode: 'DE',
      winningName: 'Germany',
      isCorrect: true,
    });
    db.logUserRound(first, 'user', true);
    db.logUserRound(second, 'user', false);

    expect(db.accuracyByMap('user')).toEqual([
      { mapName: 'Test Map', total: 2, correct: 1, acc: 50 },
    ]);
    db.close();
  });
});
