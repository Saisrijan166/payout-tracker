import type { Milestone } from '../../src/domain/milestones';
import { entitledPayout, planPayout, planViewUpdate } from '../../src/domain/payout';
import { randomInt, seededRandom } from '../helpers/random';

// The ladder from the brief: 10K -> ₹500, 50K -> ₹2,000, 100K -> ₹5,000.
const LADDER: Milestone[] = [
  { views: 10_000, payout: 500 },
  { views: 50_000, payout: 2_000 },
  { views: 100_000, payout: 5_000 },
];

describe('entitledPayout (highest milestone crossed)', () => {
  it.each([
    [0, 0, 'no views'],
    [9_999, 0, 'one view short of the first milestone'],
    [10_000, 500, 'exactly on a threshold (inclusive)'],
    [49_999, 500, 'between two milestones'],
    [50_000, 2_000, 'exactly on the second threshold'],
    [60_000, 2_000, 'two milestones crossed: the highest only, not 2,500'],
    [100_000, 5_000, 'the top milestone'],
    [1_000_000, 5_000, 'far past the top milestone'],
  ])('%i views -> ₹%i (%s)', (views, expected) => {
    expect(entitledPayout(LADDER, views)).toBe(expected);
  });

  it('does not depend on ladder order', () => {
    const shuffled = [LADDER[2], LADDER[0], LADDER[1]] as Milestone[];
    expect(entitledPayout(shuffled, 60_000)).toBe(2_000);
    expect(entitledPayout(shuffled, 150_000)).toBe(5_000);
  });

  it('returns 0 for an empty ladder', () => {
    expect(entitledPayout([], 1_000_000)).toBe(0);
  });
});

describe('planPayout (delta and budget cap)', () => {
  it.each([
    {
      label: 'first payout within budget',
      input: { entitled: 500, alreadyPaid: 0, totalBudget: 6_000, spent: 0 },
      expected: { delta: 500, grant: 500, unpaid: 0, exhausts: false },
    },
    {
      label: 'next milestone pays only the difference',
      input: { entitled: 2_000, alreadyPaid: 500, totalBudget: 6_000, spent: 500 },
      expected: { delta: 1_500, grant: 1_500, unpaid: 0, exhausts: false },
    },
    {
      label: 'repeat of an already-paid entitlement pays nothing',
      input: { entitled: 2_000, alreadyPaid: 2_000, totalBudget: 6_000, spent: 2_000 },
      expected: { delta: 0, grant: 0, unpaid: 0, exhausts: false },
    },
    {
      label: 'budget runs out mid-payout: partial remainder',
      input: { entitled: 5_000, alreadyPaid: 0, totalBudget: 6_000, spent: 2_500 },
      expected: { delta: 5_000, grant: 3_500, unpaid: 1_500, exhausts: true },
    },
    {
      label: 'payout exactly uses up the budget',
      input: { entitled: 1_000, alreadyPaid: 0, totalBudget: 3_000, spent: 2_000 },
      expected: { delta: 1_000, grant: 1_000, unpaid: 0, exhausts: true },
    },
    {
      label: 'budget already exhausted',
      input: { entitled: 2_000, alreadyPaid: 500, totalBudget: 6_000, spent: 6_000 },
      expected: { delta: 1_500, grant: 0, unpaid: 1_500, exhausts: true },
    },
    {
      label: 'corrupt state (paid more than entitled) never pays a negative amount',
      input: { entitled: 500, alreadyPaid: 2_000, totalBudget: 6_000, spent: 2_000 },
      expected: { delta: 0, grant: 0, unpaid: 0, exhausts: false },
    },
  ])('$label', ({ input, expected }) => {
    expect(planPayout(input)).toEqual(expected);
  });
});

describe('planViewUpdate', () => {
  const base = { ladder: LADDER, alreadyPaid: 0, totalBudget: 6_000, spent: 0 };

  it('pays the highest milestone crossed when one update crosses several', () => {
    const plan = planViewUpdate({ ...base, currentViews: 0, newViews: 60_000 });
    expect(plan).toEqual({
      kind: 'apply',
      entitled: 2_000,
      delta: 2_000,
      grant: 2_000,
      unpaid: 0,
      exhausts: false,
    });
  });

  it('rejects a decreasing view count', () => {
    const plan = planViewUpdate({
      ...base,
      currentViews: 60_000,
      newViews: 55_000,
      alreadyPaid: 2_000,
    });
    expect(plan).toEqual({ kind: 'rejected', reason: 'VIEWS_DECREASED' });
  });

  it('treats the same view count as a no-op', () => {
    const plan = planViewUpdate({
      ...base,
      currentViews: 60_000,
      newViews: 60_000,
      alreadyPaid: 2_000,
    });
    expect(plan).toEqual({ kind: 'unchanged' });
  });

  it('does not double-pay when views rise but no new milestone is crossed', () => {
    const plan = planViewUpdate({
      ...base,
      currentViews: 60_000,
      newViews: 70_000,
      alreadyPaid: 2_000,
      spent: 2_000,
    });
    expect(plan).toMatchObject({ kind: 'apply', entitled: 2_000, grant: 0 });
  });

  it('replays the README worked example step by step', () => {
    // Ladder 10K/50K/100K, budget ₹6,000, three creators A, B and C.
    const budget = 6_000;
    let spent = 0;
    const subs = { A: { views: 0, paid: 0 }, B: { views: 0, paid: 0 }, C: { views: 0, paid: 0 } };

    const update = (who: keyof typeof subs, newViews: number) => {
      const sub = subs[who];
      const plan = planViewUpdate({
        ladder: LADDER,
        currentViews: sub.views,
        newViews,
        alreadyPaid: sub.paid,
        totalBudget: budget,
        spent,
      });
      if (plan.kind === 'apply') {
        sub.views = newViews;
        sub.paid += plan.grant;
        spent += plan.grant;
      }
      return plan;
    };

    expect(update('A', 60_000)).toMatchObject({ grant: 2_000 }); // crosses two milestones
    expect(update('A', 60_000)).toEqual({ kind: 'unchanged' }); // idempotent replay
    expect(update('A', 55_000)).toEqual({ kind: 'rejected', reason: 'VIEWS_DECREASED' });
    expect(update('B', 12_000)).toMatchObject({ grant: 500 });
    expect(update('C', 120_000)).toMatchObject({ grant: 3_500, unpaid: 1_500, exhausts: true });
    expect(update('B', 70_000)).toMatchObject({ entitled: 2_000, grant: 0, unpaid: 1_500 });

    expect(spent).toBe(budget);
    expect(subs.A.paid + subs.B.paid + subs.C.paid).toBe(spent);
  });

  it('never exceeds the budget or overpays across 1,000 random scenarios', () => {
    const random = seededRandom(20261013);

    for (let scenario = 0; scenario < 1_000; scenario += 1) {
      // Random valid ladder: increasing thresholds and payouts.
      const ladder: Milestone[] = [];
      let views = 0;
      let payout = 0;
      for (let rung = randomInt(random, 1, 5); rung > 0; rung -= 1) {
        views += randomInt(random, 1, 50_000);
        payout += randomInt(random, 1, 3_000);
        ladder.push({ views, payout });
      }
      const totalBudget = randomInt(random, payout, payout * 8);
      const subs = Array.from({ length: randomInt(random, 1, 20) }, () => ({ views: 0, paid: 0 }));
      let spent = 0;

      for (let step = 0; step < 60; step += 1) {
        const sub = subs[randomInt(random, 0, subs.length - 1)];
        if (!sub) continue;
        // Mostly increases, sometimes repeats or decreases.
        const newViews = Math.max(0, sub.views + randomInt(random, -5_000, 60_000));
        const plan = planViewUpdate({
          ladder,
          currentViews: sub.views,
          newViews,
          alreadyPaid: sub.paid,
          totalBudget,
          spent,
        });
        if (plan.kind !== 'apply') continue;

        expect(plan.grant).toBeGreaterThanOrEqual(0);
        sub.views = newViews;
        sub.paid += plan.grant;
        spent += plan.grant;

        expect(spent).toBeLessThanOrEqual(totalBudget);
        expect(sub.paid).toBeLessThanOrEqual(plan.entitled);
      }

      expect(subs.reduce((sum, s) => sum + s.paid, 0)).toBe(spent);
    }
  });
});
