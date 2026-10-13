import type { Milestone } from './milestones';

/**
 * The payout a post has earned at `views`: the payout of the highest milestone
 * crossed (views >= threshold). Milestones are not cumulative, so jumping past
 * several rungs in one update earns only the top one. Ladder order does not matter.
 */
export function entitledPayout(ladder: readonly Milestone[], views: number): number {
  let highest: Milestone | undefined;
  for (const milestone of ladder) {
    if (views >= milestone.views && (!highest || milestone.views > highest.views)) {
      highest = milestone;
    }
  }
  return highest?.payout ?? 0;
}

export interface PayoutInput {
  /** Payout earned at the new view count. */
  entitled: number;
  /** Amount already paid to this submission. */
  alreadyPaid: number;
  totalBudget: number;
  /** Amount the campaign has already paid out across all submissions. */
  spent: number;
}

export interface PayoutPlan {
  /** What the creator is still owed: entitled minus already paid. */
  delta: number;
  /** What is actually paid now: the delta, capped by the remaining budget. */
  grant: number;
  /** Shortfall left unpaid because the budget ran out. */
  unpaid: number;
  /** True when this payout uses up the last of the budget. */
  exhausts: boolean;
}

/**
 * Decides how much to pay now. Only the difference between what is earned and
 * what was already paid is ever paid, which makes replays harmless, and the
 * grant never exceeds the remaining budget (a partial payout if it is short).
 */
export function planPayout({ entitled, alreadyPaid, totalBudget, spent }: PayoutInput): PayoutPlan {
  const delta = Math.max(0, entitled - alreadyPaid);
  const remaining = Math.max(0, totalBudget - spent);
  const grant = Math.min(delta, remaining);
  return {
    delta,
    grant,
    unpaid: delta - grant,
    exhausts: spent + grant >= totalBudget,
  };
}

export interface ViewUpdateInput {
  ladder: readonly Milestone[];
  currentViews: number;
  newViews: number;
  alreadyPaid: number;
  totalBudget: number;
  spent: number;
}

export type ViewUpdatePlan =
  | { kind: 'rejected'; reason: 'VIEWS_DECREASED' }
  | { kind: 'unchanged' }
  | ({ kind: 'apply'; entitled: number } & PayoutPlan);

/**
 * The full decision for one view-count update, with no I/O:
 * - fewer views than already recorded is rejected (counts only move forward, nothing is clawed back);
 * - the same count is a no-op (idempotent);
 * - a higher count pays the capped delta for the highest milestone crossed.
 */
export function planViewUpdate(input: ViewUpdateInput): ViewUpdatePlan {
  if (input.newViews < input.currentViews) {
    return { kind: 'rejected', reason: 'VIEWS_DECREASED' };
  }
  if (input.newViews === input.currentViews) {
    return { kind: 'unchanged' };
  }
  const entitled = entitledPayout(input.ladder, input.newViews);
  return {
    kind: 'apply',
    entitled,
    ...planPayout({
      entitled,
      alreadyPaid: input.alreadyPaid,
      totalBudget: input.totalBudget,
      spent: input.spent,
    }),
  };
}
