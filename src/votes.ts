export interface CastVote {
  userId: string;
  /** Sovereign-state ISO code of the voted country. */
  code: string;
  /** Canonical country name. */
  name: string;
  /** Optional subdivision selected alongside a country guess. */
  subdivisionCode?: string;
  subdivisionName?: string;
  /** Timestamp (ms) when this (final) vote was cast. */
  at: number;
}

export interface WinnerInfo {
  code: string;
  name: string;
  count: number;
}

/**
 * Pick the winning country from the final votes.
 * Most votes wins; ties are broken by the country whose FIRST vote was cast earliest.
 */
export function pickWinner(votes: ReadonlyMap<string, CastVote>): WinnerInfo | null {
  if (votes.size === 0) return null;

  const counts = new Map<string, number>();
  const firstAt = new Map<string, number>();
  const names = new Map<string, string>();

  for (const vote of votes.values()) {
    counts.set(vote.code, (counts.get(vote.code) ?? 0) + 1);
    names.set(vote.code, vote.name);
    const prev = firstAt.get(vote.code);
    if (prev === undefined || vote.at < prev) firstAt.set(vote.code, vote.at);
  }

  let best: WinnerInfo & { at: number } | null = null;
  for (const [code, count] of counts) {
    const at = firstAt.get(code)!;
    if (!best || count > best.count || (count === best.count && at < best.at)) {
      best = { code, name: names.get(code)!, count, at };
    }
  }
  return best ? { code: best.code, name: best.name, count: best.count } : null;
}

/**
 * Pick the most-voted subdivision for the winning country, if any.
 * Ties are broken by earliest vote timestamp.
 */
export function pickWinningSubdivision(
  votes: ReadonlyMap<string, CastVote>,
  winningCountryCode: string,
): { code?: string; name?: string } | null {
  const matching = [...votes.values()].filter(
    (v) => v.code.toUpperCase() === winningCountryCode.toUpperCase() && (v.subdivisionCode || v.subdivisionName),
  );
  if (matching.length === 0) return null;

  const counts = new Map<string, { code?: string; name?: string; count: number; firstAt: number }>();
  for (const v of matching) {
    const key = (v.subdivisionCode || v.subdivisionName)!.toUpperCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
      if (v.at < existing.firstAt) existing.firstAt = v.at;
    } else {
      counts.set(key, { code: v.subdivisionCode, name: v.subdivisionName, count: 1, firstAt: v.at });
    }
  }

  let best: { code?: string; name?: string; count: number; firstAt: number } | null = null;
  for (const item of counts.values()) {
    if (!best || item.count > best.count || (item.count === best.count && item.firstAt < best.firstAt)) {
      best = item;
    }
  }
  return best ? { code: best.code, name: best.name } : null;
}

/** Tally per country, sorted by vote count (desc), then by earliest first vote. */
export function tallyVotes(votes: ReadonlyMap<string, CastVote>): WinnerInfo[] {
  const counts = new Map<string, number>();
  const firstAt = new Map<string, number>();
  const names = new Map<string, string>();
  for (const vote of votes.values()) {
    counts.set(vote.code, (counts.get(vote.code) ?? 0) + 1);
    names.set(vote.code, vote.name);
    const prev = firstAt.get(vote.code);
    if (prev === undefined || vote.at < prev) firstAt.set(vote.code, vote.at);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, name: names.get(code)!, count, at: firstAt.get(code)! }))
    .sort((a, b) => b.count - a.count || a.at - b.at)
    .map(({ code, name, count }) => ({ code, name, count }));
}

/**
 * Parse `!g <c1> or <c2> or ...` input.
 * With multiple options, one is picked at random using the injected rng.
 */
export function chooseFromInput(
  input: string,
  rng: () => number,
): { chosen: string; options: string[] } {
  const options = input
    .split(/\s*\bor\b\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (options.length <= 1) {
    return { chosen: input.trim(), options: [input.trim()] };
  }
  const chosen = options[Math.floor(rng() * options.length)];
  return { chosen, options };
}
