import { describe, expect, it } from 'vitest';
import { computeXpAwards, type XpConfig } from '../src/xp.js';

const cfg: XpConfig = { participation: 5, correct: 25, milestone: 100, milestones: [5, 10, 25, 50, 100] };

describe('computeXpAwards', () => {
  it('gives participation XP to every voter', () => {
    const awards = computeXpAwards({
      finalVotes: new Map([['a', 'FR'], ['b', 'ES']]),
      winningCode: 'FR',
      actualCode: 'ES',
      isCorrect: false,
      newStreak: 0,
      cfg,
    });
    expect(awards.get('a')).toBe(5);
    expect(awards.get('b')).toBe(5);
  });

  it('gives the correct bonus only to voters of the winning country when correct', () => {
    const awards = computeXpAwards({
      finalVotes: new Map([['a', 'FR'], ['b', 'ES'], ['c', 'FR']]),
      winningCode: 'FR',
      actualCode: 'FR',
      isCorrect: true,
      newStreak: 3,
      cfg,
    });
    expect(awards.get('a')).toBe(30);
    expect(awards.get('c')).toBe(30);
    expect(awards.get('b')).toBe(5);
  });

  it('adds the milestone bonus to everyone on milestone streaks', () => {
    const awards = computeXpAwards({
      finalVotes: new Map([['a', 'FR'], ['b', 'ES']]),
      winningCode: 'FR',
      actualCode: 'FR',
      isCorrect: true,
      newStreak: 10,
      cfg,
    });
    expect(awards.get('a')).toBe(5 + 25 + 100);
    expect(awards.get('b')).toBe(5 + 100);
  });

  it('does not give milestone bonus on non-milestone streaks', () => {
    const awards = computeXpAwards({
      finalVotes: new Map([['a', 'FR']]),
      winningCode: 'FR',
      actualCode: 'FR',
      isCorrect: true,
      newStreak: 9,
      cfg,
    });
    expect(awards.get('a')).toBe(30);
  });

  it('doubles the reward when an optional subdivision guess is correct', () => {
    const awards = computeXpAwards({
      finalVotes: new Map([['a', 'MX'], ['b', 'MX']]),
      winningCode: 'MX',
      actualCode: 'MX',
      isCorrect: true,
      newStreak: 1,
      cfg,
      subdivisionCorrectUsers: new Set(['a']),
    });
    expect(awards.get('a')).toBe((cfg.participation + cfg.correct) * 2);
    expect(awards.get('b')).toBe(cfg.participation + cfg.correct);
  });
});
