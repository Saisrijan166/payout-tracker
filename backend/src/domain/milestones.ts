/** One rung of a campaign's payout ladder: reach `views` and the post is worth `payout` rupees. */
export interface Milestone {
  views: number;
  payout: number;
}

export const MAX_MILESTONES = 10;

export type LadderResult = { ok: true; ladder: Milestone[] } | { ok: false; issues: string[] };

const isPositiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

/**
 * Sorts a milestone ladder by views and validates it.
 *
 * A valid ladder has 1 to 10 rungs, positive whole-number views and payouts,
 * unique view thresholds, payouts that strictly increase with views, and a top
 * payout no larger than the campaign budget. Every broken rule is reported.
 */
export function parseMilestoneLadder(
  input: readonly Milestone[],
  totalBudget: number,
): LadderResult {
  const issues: string[] = [];

  if (input.length === 0) issues.push('Add at least one milestone');
  if (input.length > MAX_MILESTONES) issues.push(`Use at most ${MAX_MILESTONES} milestones`);
  input.forEach((milestone, index) => {
    if (!isPositiveInteger(milestone.views)) {
      issues.push(`Milestone ${index + 1}: views must be a positive whole number`);
    }
    if (!isPositiveInteger(milestone.payout)) {
      issues.push(`Milestone ${index + 1}: payout must be a positive whole number of rupees`);
    }
  });
  if (issues.length > 0) return { ok: false, issues };

  const ladder = [...input]
    .sort((a, b) => a.views - b.views)
    .map(({ views, payout }) => ({ views, payout }));

  ladder.forEach((current, index) => {
    const previous = ladder[index - 1];
    if (!previous) return;
    if (current.views === previous.views) {
      issues.push(`View threshold ${current.views} is used more than once`);
    } else if (current.payout <= previous.payout) {
      issues.push(
        `Payout at ${current.views} views must be higher than the payout at ${previous.views} views`,
      );
    }
  });

  const top = ladder[ladder.length - 1];
  if (top && top.payout > totalBudget) {
    issues.push(`Top payout (${top.payout}) cannot exceed the total budget (${totalBudget})`);
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, ladder };
}
