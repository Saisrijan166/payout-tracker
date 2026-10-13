import request from 'supertest';
import { createApp } from '../../src/app';
import { CampaignModel } from '../../src/models/campaign.model';
import { SubmissionModel, VIEW_HISTORY_LIMIT } from '../../src/models/submission.model';
import { bearer, signupAs } from '../helpers/auth';
import { createCampaignAs } from '../helpers/campaigns';
import { patchViews, submitPostAs } from '../helpers/submissions';
import { useTestDb } from '../setup/db';

const app = createApp();

/** Ladder 10K/50K/100K -> ₹500/₹2,000/₹5,000, budget ₹6,000, three creators' posts. */
async function workedExampleSetup() {
  const brand = await signupAs(app, 'brand');
  const campaign = await createCampaignAs(app, brand.token, { totalBudget: 6_000 });
  const [a, b, c] = await Promise.all(
    ['A', 'B', 'C'].map(async (name) => {
      const creator = await signupAs(app, 'creator', `Creator ${name}`);
      return submitPostAs(app, creator.token, campaign.id);
    }),
  );
  if (!a || !b || !c) throw new Error('setup failed');
  return { brand, campaign, a, b, c };
}

describe('PATCH /api/submissions/:id/views', () => {
  useTestDb();

  it('replays the worked example: highest milestone, deltas, idempotency, partial payout', async () => {
    const { brand, campaign, a, b, c } = await workedExampleSetup();

    // 1. A: 0 -> 60K crosses two milestones but is paid only the highest (₹2,000, not ₹2,500).
    const step1 = await patchViews(app, a.id, 60_000);
    expect(step1.status).toBe(200);
    expect(step1.body.payout).toEqual({
      entitled: 2_000,
      paidNow: 2_000,
      paidTotal: 2_000,
      unpaid: 0,
    });
    expect(step1.body.campaign).toEqual({
      id: campaign.id,
      spent: 2_000,
      remaining: 4_000,
      status: 'live',
    });

    // 2. Same count again: no-op, nothing paid twice.
    const step2 = await patchViews(app, a.id, 60_000);
    expect(step2.status).toBe(200);
    expect(step2.body.payout).toEqual({ entitled: 2_000, paidNow: 0, paidTotal: 2_000, unpaid: 0 });
    expect(step2.body.campaign.spent).toBe(2_000);

    // 3. Fewer views: rejected, nothing changes.
    const step3 = await patchViews(app, a.id, 55_000);
    expect(step3.status).toBe(409);
    expect(step3.body.error).toEqual({
      code: 'VIEWS_DECREASED',
      message: 'View count cannot go down (currently 60000)',
      details: { currentViews: 60_000 },
    });

    // 4. B: 0 -> 12K earns ₹500.
    const step4 = await patchViews(app, b.id, 12_000);
    expect(step4.body.payout.paidNow).toBe(500);
    expect(step4.body.campaign.spent).toBe(2_500);

    // 5. C: 0 -> 120K earns ₹5,000 but only ₹3,500 is left: partial payout, campaign exhausted.
    const step5 = await patchViews(app, c.id, 120_000);
    expect(step5.body.payout).toEqual({
      entitled: 5_000,
      paidNow: 3_500,
      paidTotal: 3_500,
      unpaid: 1_500,
    });
    expect(step5.body.campaign).toEqual({
      id: campaign.id,
      spent: 6_000,
      remaining: 0,
      status: 'exhausted',
    });

    // 6. B: 12K -> 70K earns ₹2,000 (₹1,500 more) but the budget is gone: views recorded, ₹0 paid.
    const step6 = await patchViews(app, b.id, 70_000);
    expect(step6.status).toBe(200);
    expect(step6.body.payout).toEqual({
      entitled: 2_000,
      paidNow: 0,
      paidTotal: 500,
      unpaid: 1_500,
    });
    expect(step6.body.submission.views).toBe(70_000);

    // Final state: spent equals the sum of payouts and never exceeds the budget.
    const detail = await request(app)
      .get(`/api/campaigns/${campaign.id}`)
      .set('Authorization', bearer(brand.token));
    expect(detail.body.campaign).toMatchObject({ spent: 6_000, remaining: 0, status: 'exhausted' });
    const paid = detail.body.submissions.reduce(
      (sum: number, s: { paidAmount: number }) => sum + s.paidAmount,
      0,
    );
    expect(paid).toBe(6_000);
  });

  it('hides an exhausted campaign from the live list', async () => {
    const brand = await signupAs(app, 'brand');
    const creator = await signupAs(app, 'creator');
    const campaign = await createCampaignAs(app, brand.token, {
      totalBudget: 500,
      milestones: [{ views: 10_000, payout: 500 }],
    });
    const submission = await submitPostAs(app, creator.token, campaign.id);

    await patchViews(app, submission.id, 10_000).expect(200);

    const live = await request(app)
      .get('/api/campaigns')
      .set('Authorization', bearer(creator.token));
    expect(live.body.campaigns).toEqual([]);
  });

  it('needs no authentication (it simulates platform data)', async () => {
    const { a } = await workedExampleSetup();
    const res = await request(app).patch(`/api/submissions/${a.id}/views`).send({ views: 10_000 });
    expect(res.status).toBe(200);
  });

  it('records each reading in a capped view history', async () => {
    const { a } = await workedExampleSetup();
    for (let i = 1; i <= VIEW_HISTORY_LIMIT + 5; i += 1) {
      await patchViews(app, a.id, i * 1_000).expect(200);
    }
    const stored = await SubmissionModel.findById(a.id).lean();
    expect(stored?.viewHistory).toHaveLength(VIEW_HISTORY_LIMIT);
    expect(stored?.viewHistory.at(-1)).toMatchObject({ views: 25_000, paid: 0 });
    expect(stored?.viewHistory.find((r) => r.paid > 0)).toMatchObject({ views: 10_000, paid: 500 });
  });

  it('returns 404 for an unknown submission and 400 for a malformed id', async () => {
    const missing = await patchViews(app, 'a'.repeat(24), 10);
    const malformed = await patchViews(app, 'not-an-id', 10);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('SUBMISSION_NOT_FOUND');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_ID');
  });

  it.each([
    ['negative', -1],
    ['fractional', 10.5],
    ['a numeric string', '10000'],
    ['missing', undefined],
    ['beyond the safe integer range', Number.MAX_SAFE_INTEGER + 2],
  ])('rejects %s views with 400 and changes nothing', async (_label, views) => {
    const { a } = await workedExampleSetup();
    const res = await patchViews(app, a.id, views);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const stored = await SubmissionModel.findById(a.id).lean();
    expect(stored?.views).toBe(0);
  });

  it('rejects unexpected fields such as a client-supplied payout', async () => {
    const { a } = await workedExampleSetup();
    const res = await request(app)
      .patch(`/api/submissions/${a.id}/views`)
      .send({ views: 10_000, paidAmount: 99_999 });
    expect(res.status).toBe(400);
  });

  it('accepts 0 views on a fresh submission as a no-op', async () => {
    const { a } = await workedExampleSetup();
    const res = await patchViews(app, a.id, 0);
    expect(res.status).toBe(200);
    expect(res.body.payout.paidNow).toBe(0);
  });

  it('never pays beyond the budget even if the stored spent was already at the cap', async () => {
    const { campaign, a } = await workedExampleSetup();
    await CampaignModel.updateOne(
      { _id: campaign.id },
      { $set: { spent: 6_000, status: 'exhausted' } },
    );
    const res = await patchViews(app, a.id, 100_000);
    expect(res.body.payout).toEqual({ entitled: 5_000, paidNow: 0, paidTotal: 0, unpaid: 5_000 });
    const stored = await CampaignModel.findById(campaign.id).lean();
    expect(stored?.spent).toBe(6_000);
  });

  describe('view-spike flag', () => {
    it('flags a sudden jump but still pays the milestone', async () => {
      const { a } = await workedExampleSetup();
      const res = await patchViews(app, a.id, 15_000); // seconds after submission
      expect(res.status).toBe(200);
      expect(res.body.payout.paidNow).toBe(500);
      expect(res.body.submission.flagged).toBe(true);
      expect(res.body.submission.flagReason).toMatch(/^\+15,000 views in under a minute/);
    });

    it('does not flag the same gain spread over two hours', async () => {
      const { a } = await workedExampleSetup();
      await SubmissionModel.updateOne(
        { _id: a.id },
        { $set: { 'viewHistory.0.at': new Date(Date.now() - 2 * 60 * 60_000) } },
      );
      const res = await patchViews(app, a.id, 15_000);
      expect(res.body.submission.flagged).toBe(false);
      expect(res.body.submission.flagReason).toBeUndefined();
    });

    it('keeps the flag and its first reason on later updates', async () => {
      const { brand, campaign, a } = await workedExampleSetup();
      const first = await patchViews(app, a.id, 15_000);
      await patchViews(app, a.id, 15_500).expect(200);

      const stored = await SubmissionModel.findById(a.id).lean();
      expect(stored?.flagged).toBe(true);
      expect(stored?.flagReason).toBe(first.body.submission.flagReason);

      const mine = await request(app)
        .get('/api/campaigns/mine')
        .set('Authorization', bearer(brand.token));
      expect(mine.body.campaigns).toEqual([
        expect.objectContaining({ id: campaign.id, submissionCount: 3, flaggedCount: 1 }),
      ]);
    });
  });
});
