import { describe, expect, it } from 'vitest';
import { chooseFromInput, pickWinner, pickWinningSubdivision, tallyVotes, type CastVote } from '../src/votes.js';

function vote(userId: string, code: string, name: string, at: number, subdivisionCode?: string, subdivisionName?: string): CastVote {
  return { userId, code, name, at, subdivisionCode, subdivisionName };
}

describe('pickWinner', () => {
  it('returns null with no votes', () => {
    expect(pickWinner(new Map())).toBeNull();
  });

  it('picks the country with the most votes', () => {
    const votes = new Map<string, CastVote>([
      ['a', vote('a', 'FR', 'France', 1000)],
      ['b', vote('b', 'ES', 'Spain', 1100)],
      ['c', vote('c', 'FR', 'France', 1200)],
    ]);
    expect(pickWinner(votes)).toEqual({ code: 'FR', name: 'France', count: 2 });
  });

  it('breaks ties by the earliest first vote', () => {
    const votes = new Map<string, CastVote>([
      ['a', vote('a', 'ES', 'Spain', 2000)], // Spain cast first overall? no — France at 1000
      ['b', vote('b', 'FR', 'France', 1000)],
      ['c', vote('c', 'ES', 'Spain', 2100)],
      ['d', vote('d', 'FR', 'France', 1500)],
    ]);
    const winner = pickWinner(votes);
    expect(winner?.code).toBe('FR'); // 2-2 tie, France's first vote (1000) beats Spain's (2000)
  });

  it('respects that a changed vote only counts the latest choice', () => {
    // The session stores only the latest vote per user; simulate the end state
    // where user "a" changed from FR to ES late. 1-1 tie: FR (first cast at 1000)
    // beats ES (first cast at 5000).
    const votes = new Map<string, CastVote>([
      ['a', vote('a', 'ES', 'Spain', 5000)],
      ['b', vote('b', 'FR', 'France', 1000)],
    ]);
    expect(pickWinner(votes)?.code).toBe('FR');
  });

  it('tallyVotes sorts by count then earliest', () => {
    const votes = new Map<string, CastVote>([
      ['a', vote('a', 'ES', 'Spain', 2000)],
      ['b', vote('b', 'FR', 'France', 1000)],
      ['c', vote('c', 'FR', 'France', 1500)],
    ]);
    const tally = tallyVotes(votes);
    expect(tally[0]).toEqual({ code: 'FR', name: 'France', count: 2 });
    expect(tally[1]).toEqual({ code: 'ES', name: 'Spain', count: 1 });
  });
});

describe('pickWinningSubdivision', () => {
  it('returns null if no votes exist or no subdivision was guessed', () => {
    expect(pickWinningSubdivision(new Map(), 'US')).toBeNull();

    const votesWithoutSub = new Map<string, CastVote>([
      ['a', vote('a', 'US', 'United States', 1000)],
      ['b', vote('b', 'FR', 'France', 1100)],
    ]);
    expect(pickWinningSubdivision(votesWithoutSub, 'US')).toBeNull();
  });

  it('picks the most-voted subdivision for the winning country', () => {
    const votes = new Map<string, CastVote>([
      ['a', vote('a', 'US', 'United States', 1000, 'US-CA', 'California')],
      ['b', vote('b', 'US', 'United States', 1100, 'US-TX', 'Texas')],
      ['c', vote('c', 'US', 'United States', 1200, 'US-CA', 'California')],
      ['d', vote('d', 'FR', 'France', 900, 'FR-75', 'Paris')],
    ]);
    expect(pickWinningSubdivision(votes, 'US')).toEqual({ code: 'US-CA', name: 'California' });
  });

  it('breaks ties between subdivisions by earliest timestamp', () => {
    const votes = new Map<string, CastVote>([
      ['a', vote('a', 'US', 'United States', 2000, 'US-TX', 'Texas')],
      ['b', vote('b', 'US', 'United States', 1000, 'US-CA', 'California')],
    ]);
    expect(pickWinningSubdivision(votes, 'US')).toEqual({ code: 'US-CA', name: 'California' });
  });
});

describe('chooseFromInput ("or" guesses)', () => {
  it('returns the input unchanged without "or"', () => {
    expect(chooseFromInput('france', Math.random)).toEqual({ chosen: 'france', options: ['france'] });
  });

  it('splits on " or " and picks deterministically with injected rng', () => {
    const { chosen, options } = chooseFromInput('spain or italy', () => 0);
    expect(options).toEqual(['spain', 'italy']);
    expect(chosen).toBe('spain');

    expect(chooseFromInput('spain or italy', () => 0.99).chosen).toBe('italy');
    expect(chooseFromInput('a or b or c', () => 0.5).chosen).toBe('b');
  });

  it('ignores empty segments', () => {
    expect(chooseFromInput('france or  or spain', () => 0.99).chosen).toBe('spain');
  });
});
