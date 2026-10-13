import request from 'supertest';
import { createApp } from '../../src/app';
import { CampaignModel } from '../../src/models/campaign.model';
import { SubmissionModel } from '../../src/models/submission.model';
import { bearer, signupAs } from '../helpers/auth';
import { createCampaignAs } from '../helpers/campaigns';
import { useTestDb } from '../setup/db';

const app = createApp();
const POST = 'https://www.instagram.com/reel/C8xYz12AbC/?igsh=share';

async function setup() {
  const brand = await signupAs(app, 'brand', 'Acme');
  const creator = await signupAs(app, 'creator', 'Meme Page');
  const campaign = await createCampaignAs(app, brand.token, { name: 'Diwali Drop' });
  return { brand, creator, campaign };
}

const submit = (token: string, body: object) =>
  request(app).post('/api/submissions').set('Authorization', bearer(token)).send(body);

describe('submissions', () => {
  useTestDb();

  describe('POST /api/submissions', () => {
    it('lets a creator submit a post to a live campaign', async () => {
      const { creator, campaign } = await setup();
      const res = await submit(creator.token, { campaignId: campaign.id, postUrl: ` ${POST} ` });

      expect(res.status).toBe(201);
      expect(res.body.submission).toEqual({
        id: expect.any(String),
        campaignId: campaign.id,
        campaign: { id: campaign.id, name: 'Diwali Drop', platform: 'instagram' },
        creatorId: creator.user.id,
        postUrl: POST,
        views: 0,
        entitledAmount: 0,
        paidAmount: 0,
        unpaidAmount: 0,
        flagged: false,
        lastViewsAt: expect.any(String),
        createdAt: expect.any(String),
      });
      const stored = await SubmissionModel.findById(res.body.submission.id).lean();
      expect(stored?.postKey).toBe('instagram:C8xYz12AbC');
      expect(stored?.viewHistory).toEqual([{ views: 0, at: expect.any(Date), paid: 0 }]);
    });

    it('is creator-only', async () => {
      const { brand, campaign } = await setup();
      const res = await submit(brand.token, { campaignId: campaign.id, postUrl: POST });
      expect(res.status).toBe(403);
    });

    it('returns 404 for an unknown campaign and 400 for a malformed id', async () => {
      const { creator } = await setup();
      const unknown = await submit(creator.token, { campaignId: 'f'.repeat(24), postUrl: POST });
      const malformed = await submit(creator.token, { campaignId: 'nope', postUrl: POST });
      expect(unknown.status).toBe(404);
      expect(unknown.body.error.code).toBe('CAMPAIGN_NOT_FOUND');
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects an exhausted campaign with 409 CAMPAIGN_NOT_LIVE', async () => {
      const { creator, campaign } = await setup();
      await CampaignModel.updateOne(
        { _id: campaign.id },
        { $set: { spent: 6_000, status: 'exhausted' } },
      );
      const res = await submit(creator.token, { campaignId: campaign.id, postUrl: POST });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CAMPAIGN_NOT_LIVE');
    });

    it('rejects a post from the wrong platform and links that are not posts', async () => {
      const { creator, campaign } = await setup();
      const youtube = await submit(creator.token, {
        campaignId: campaign.id,
        postUrl: 'https://youtu.be/dQw4w9WgXcQ',
      });
      const profile = await submit(creator.token, {
        campaignId: campaign.id,
        postUrl: 'https://instagram.com/memepage',
      });
      expect(youtube.status).toBe(400);
      expect(youtube.body.error).toEqual({
        code: 'PLATFORM_MISMATCH',
        message: 'This campaign only accepts Instagram posts',
      });
      expect(profile.status).toBe(400);
      expect(profile.body.error.code).toBe('INVALID_POST_URL');
    });

    it('rejects the same post again, spelled differently, by anyone, for any campaign', async () => {
      const { brand, creator, campaign } = await setup();
      const otherCreator = await signupAs(app, 'creator');
      const otherCampaign = await createCampaignAs(app, brand.token, { name: 'Holi Hype' });
      await submit(creator.token, { campaignId: campaign.id, postUrl: POST }).expect(201);

      const attempts = await Promise.all([
        submit(creator.token, {
          campaignId: campaign.id,
          postUrl: 'instagram.com/p/C8xYz12AbC',
        }),
        submit(otherCreator.token, { campaignId: campaign.id, postUrl: POST }),
        submit(creator.token, { campaignId: otherCampaign.id, postUrl: POST }),
      ]);
      for (const res of attempts) {
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('DUPLICATE_SUBMISSION');
      }
    });

    it('accepts exactly one of several simultaneous submissions of the same post', async () => {
      const { creator, campaign } = await setup();
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          submit(creator.token, { campaignId: campaign.id, postUrl: POST }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      expect(await SubmissionModel.countDocuments()).toBe(1);
    });

    it('allows several different posts from one creator to one campaign', async () => {
      const { creator, campaign } = await setup();
      await submit(creator.token, { campaignId: campaign.id, postUrl: POST }).expect(201);
      await submit(creator.token, {
        campaignId: campaign.id,
        postUrl: 'https://instagram.com/p/DifferentPost1',
      }).expect(201);
    });
  });

  describe('GET /api/submissions/mine', () => {
    it("returns only the creator's submissions with earnings totals", async () => {
      const { creator, campaign } = await setup();
      const other = await signupAs(app, 'creator');
      const first = await submit(creator.token, { campaignId: campaign.id, postUrl: POST });
      await submit(creator.token, {
        campaignId: campaign.id,
        postUrl: 'https://instagram.com/p/SecondPost1',
      });
      await submit(other.token, {
        campaignId: campaign.id,
        postUrl: 'https://instagram.com/p/OtherPost11',
      });
      await SubmissionModel.updateOne(
        { _id: first.body.submission.id },
        { $set: { views: 120_000, entitledAmount: 5_000, paidAmount: 3_500 } },
      );

      const res = await request(app)
        .get('/api/submissions/mine')
        .set('Authorization', bearer(creator.token));

      expect(res.status).toBe(200);
      expect(res.body.summary).toEqual({
        totalEarned: 3_500,
        totalEntitled: 5_000,
        totalUnpaid: 1_500,
        submissionCount: 2,
      });
      expect(res.body.submissions).toHaveLength(2);
      expect(res.body.submissions[1]).toMatchObject({
        paidAmount: 3_500,
        unpaidAmount: 1_500,
        campaign: { id: campaign.id, name: 'Diwali Drop', platform: 'instagram' },
      });
    });

    it('is creator-only', async () => {
      const { brand } = await setup();
      await request(app)
        .get('/api/submissions/mine')
        .set('Authorization', bearer(brand.token))
        .expect(403);
    });
  });

  describe('brand campaign views', () => {
    it('include submissions with creator names and per-campaign counts', async () => {
      const { brand, creator, campaign } = await setup();
      const sub = await submit(creator.token, { campaignId: campaign.id, postUrl: POST });
      await SubmissionModel.updateOne({ _id: sub.body.submission.id }, { $set: { flagged: true } });

      const detail = await request(app)
        .get(`/api/campaigns/${campaign.id}`)
        .set('Authorization', bearer(brand.token));
      const mine = await request(app)
        .get('/api/campaigns/mine')
        .set('Authorization', bearer(brand.token));

      expect(detail.body.submissions).toEqual([
        expect.objectContaining({
          id: sub.body.submission.id,
          creator: { id: creator.user.id, name: 'Meme Page' },
          flagged: true,
        }),
      ]);
      expect(mine.body.campaigns[0]).toMatchObject({ submissionCount: 1, flaggedCount: 1 });
    });
  });
});
