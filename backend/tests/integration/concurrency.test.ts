import type { Server } from 'node:http';
import request from 'supertest';
import { createApp } from '../../src/app';
import type { Milestone } from '../../src/domain/milestones';
import { CampaignModel } from '../../src/models/campaign.model';
import { SubmissionModel } from '../../src/models/submission.model';
import {
  applyViewUpdate,
  recordReading,
  reserveBudget,
} from '../../src/modules/submissions/views.service';
import { signupAs } from '../helpers/auth';
import { createCampaignAs } from '../helpers/campaigns';
import { assertInvariants } from '../helpers/invariants';
import { randomInt, seededRandom } from '../helpers/random';
import { submitPostAs } from '../helpers/submissions';
import { useTestDb } from '../setup/db';

const app = createApp();
let server: Server;

beforeAll(() => {
  server = app.listen(0);
});
afterAll(() => {
  server.close();
});

const patchViews = (submissionId: string, views: number) =>
  request(server).patch(`/api/submissions/${submissionId}/views`).send({ views });

/** A campaign plus `count` submissions from different creators. */
async function campaignWithSubmissions(
  count: number,
  totalBudget: number,
  milestones: Milestone[],
) {
  const brand = await signupAs(app, 'brand');
  const campaign = await createCampaignAs(app, brand.token, { totalBudget, milestones });
  const submissions = [];
  for (let i = 0; i < count; i += 1) {
    const creator = await signupAs(app, 'creator');
    submissions.push(await submitPostAs(app, creator.token, campaign.id));
  }
  return { campaign, submissions };
}

describe('concurrent view updates', () => {
  useTestDb();

  it('two simultaneous updates cannot overspend the budget', async () => {
    // Each post earns ₹2,000 but only ₹2,500 exists: one gets ₹2,000, the other the ₹500 left.
    const { campaign, submissions } = await campaignWithSubmissions(2, 2_500, [
      { views: 10_000, payout: 2_000 },
    ]);

    const responses = await Promise.all(submissions.map((s) => patchViews(s.id, 10_000)));

    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const paidNow = responses.map((r) => r.body.payout.paidNow as number).sort((a, b) => a - b);
    expect(paidNow).toEqual([500, 2_000]);
    const stored = await CampaignModel.findById(campaign.id).lean();
    expect(stored).toMatchObject({ spent: 2_500, status: 'exhausted' });
    await assertInvariants(campaign.id);
  });

  it('many simultaneous updates share the budget exactly, with one partial payout', async () => {
    const { campaign, submissions } = await campaignWithSubmissions(5, 5_000, [
      { views: 10_000, payout: 2_000 },
    ]);

    const responses = await Promise.all(submissions.map((s) => patchViews(s.id, 10_000)));

    const paidNow = responses.map((r) => r.body.payout.paidNow as number).sort((a, b) => a - b);
    expect(paidNow).toEqual([0, 0, 1_000, 2_000, 2_000]);
    await assertInvariants(campaign.id);
  });

  it('20 identical simultaneous updates to one submission pay the delta exactly once', async () => {
    const { campaign, submissions } = await campaignWithSubmissions(1, 6_000, [
      { views: 10_000, payout: 500 },
      { views: 50_000, payout: 2_000 },
    ]);
    const [submission] = submissions;
    if (!submission) throw new Error('setup failed');

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => patchViews(submission.id, 60_000)),
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    const totalPaidNow = responses.reduce((sum, r) => sum + (r.body.payout.paidNow as number), 0);
    expect(totalPaidNow).toBe(2_000);
    const stored = await SubmissionModel.findById(submission.id).lean();
    expect(stored?.paidAmount).toBe(2_000);
    expect(stored?.viewHistory.filter((r) => r.views === 60_000)).toHaveLength(1);
    await assertInvariants(campaign.id);
  });

  it('out-of-order simultaneous increases settle on the highest count and pay once', async () => {
    const { campaign, submissions } = await campaignWithSubmissions(1, 6_000, [
      { views: 10_000, payout: 500 },
      { views: 50_000, payout: 2_000 },
      { views: 100_000, payout: 5_000 },
    ]);
    const [submission] = submissions;
    if (!submission) throw new Error('setup failed');

    const responses = await Promise.all(
      [15_000, 120_000, 60_000].map((views) => patchViews(submission.id, views)),
    );

    for (const res of responses) {
      expect([200, 409]).toContain(res.status);
      if (res.status === 409) expect(res.body.error.code).toBe('VIEWS_DECREASED');
    }
    const totalPaidNow = responses
      .filter((r) => r.status === 200)
      .reduce((sum, r) => sum + (r.body.payout.paidNow as number), 0);
    expect(totalPaidNow).toBe(5_000);
    const stored = await SubmissionModel.findById(submission.id).lean();
    expect(stored).toMatchObject({ views: 120_000, entitledAmount: 5_000, paidAmount: 5_000 });
    await assertInvariants(campaign.id);
  });

  it('holds at the service level too, without HTTP in between', async () => {
    const { campaign, submissions } = await campaignWithSubmissions(10, 3_000, [
      { views: 1_000, payout: 1_000 },
    ]);

    const results = await Promise.all(submissions.map((s) => applyViewUpdate(s.id, 1_000)));

    const paidNow = results.map((r) => r.payout.paidNow).sort((a, b) => b - a);
    expect(paidNow).toEqual([1_000, 1_000, 1_000, 0, 0, 0, 0, 0, 0, 0]);
    await assertInvariants(campaign.id);
  });

  it('keeps every invariant under a seeded burst of mixed concurrent updates', async () => {
    const { campaign, submissions } = await campaignWithSubmissions(8, 20_000, [
      { views: 10_000, payout: 500 },
      { views: 50_000, payout: 2_000 },
      { views: 100_000, payout: 5_000 },
    ]);
    const random = seededRandom(42);

    for (let round = 0; round < 5; round += 1) {
      const batch = Array.from({ length: 12 }, () => {
        const submission = submissions[randomInt(random, 0, submissions.length - 1)];
        if (!submission) throw new Error('unreachable');
        return patchViews(submission.id, randomInt(random, 0, 150_000));
      });
      const responses = await Promise.all(batch);
      for (const res of responses) {
        expect([200, 409]).toContain(res.status);
        if (res.status === 409) {
          expect(['VIEWS_DECREASED', 'CONCURRENT_UPDATE']).toContain(res.body.error.code);
        }
      }
      await assertInvariants(campaign.id);
    }
  });

  describe('database guards (independent of the application-level plan)', () => {
    it('reserveBudget refuses a grant that would overspend, even from a stale read', async () => {
      const { campaign } = await campaignWithSubmissions(0, 1_000, [{ views: 10, payout: 600 }]);
      const stored = await CampaignModel.findById(campaign.id).lean();
      if (!stored) throw new Error('setup failed');

      // Two callers both read spent = 0 and plan ₹600 each: only the first fits.
      const first = await reserveBudget(stored._id, 600);
      const second = await reserveBudget(stored._id, 600);

      expect(first).toMatchObject({ spent: 600, status: 'live' });
      expect(second).toBeNull();
      expect(await CampaignModel.findById(campaign.id).lean()).toMatchObject({ spent: 600 });

      // Filling the budget exactly flips the status in the same write.
      expect(await reserveBudget(stored._id, 400)).toMatchObject({
        spent: 1_000,
        status: 'exhausted',
      });
    });

    it('recordReading refuses to pay again once the submission has moved on', async () => {
      const { submissions } = await campaignWithSubmissions(1, 1_000, [{ views: 10, payout: 600 }]);
      const stored = await SubmissionModel.findById(submissions[0]?.id).lean();
      if (!stored) throw new Error('setup failed');
      const reading = { views: 10, entitled: 600, paid: 600, at: new Date() };

      // Both callers planned from the same snapshot (views 0, paid 0): only one write matches.
      const first = await recordReading(stored, reading);
      const replay = await recordReading(stored, reading);

      expect(first).toMatchObject({ views: 10, paidAmount: 600 });
      expect(replay).toBeNull();
      expect(await SubmissionModel.findById(stored._id).lean()).toMatchObject({ paidAmount: 600 });
    });
  });
});
