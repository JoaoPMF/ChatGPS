export interface XpConfig {
  participation: number;
  correct: number;
  milestone: number;
  milestones: number[];
}

export interface XpAwardInput {
  /** Final votes of the round: userId -> country code. */
  finalVotes: ReadonlyMap<string, string>;
  winningCode: string;
  /** Sovereign code of the actual location, or null if it could not be determined. */
  actualCode: string | null;
  isCorrect: boolean;
  /** Streak length after this round (only meaningful when isCorrect). */
  newStreak: number;
  cfg: XpConfig;
  /** Users whose optional subdivision guess was correct; country mode only. */
  subdivisionCorrectUsers?: ReadonlySet<string>;
}

/**
 * Compute XP awards for a resolved round.
 * - Every voter gets participation XP.
 * - If the winning answer was correct, voters who voted for it get the correct bonus.
 * - On milestone streaks, every voter additionally gets the milestone bonus.
 */
export function computeXpAwards(input: XpAwardInput): Map<string, number> {
  const awards = new Map<string, number>();
  const hitMilestone = input.isCorrect && input.cfg.milestones.includes(input.newStreak);

  for (const [userId, code] of input.finalVotes) {
    let xp = input.cfg.participation;
    if (input.isCorrect && code === input.winningCode) xp += input.cfg.correct;
    if (hitMilestone) xp += input.cfg.milestone;
    if (input.subdivisionCorrectUsers?.has(userId)) xp *= 2;
    awards.set(userId, xp);
  }
  return awards;
}
