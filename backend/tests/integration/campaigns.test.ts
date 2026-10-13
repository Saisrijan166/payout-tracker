import request from 'supertest';
import { createApp } from '../../src/app';
import { CampaignModel } from '../../src/models/campaign.model';
import { bearer, signupAs } from '../helpers/auth';
import { BRIEF_LADDER, createCampaignAs } from '../helpers/campaigns';
import { useTestDb } from '../setup/db';

const app = createApp();

describe('campaigns', () => {
  useTestDb();

  describe('POST /api/campaigns', () => {
    it('lets a brand create a campaign and stores the ladder sorted by views', async () => {
      const { token, user } = await signupAs(app, 'brand');
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', bearer(token))
        .send({
          name: 'Diwali Drop',
          platform: 'youtube',
          totalBudget: 50_000,
          milestones: [BRIEF_LADDER[2], BRIEF_LADDER[0], BRIEF_LADDER[1]],
        });

      expect(res.status).toBe(201);
      expect(res.body.campaign).toEqual({
        id: expect.any(String),
        brandId: user.id,
        name: 'Diwali Drop',
        platform: 'youtube',
        totalBudget: 50_000,
        spent: 0,
        remaining: 50_000,
        milestones: BRIEF_LADDER,
        status: 'live',
        createdAt: expect.any(String),
      });
    });

    it('rejects creators with 403 and anonymous callers with 401', async () => {
      const { token } = await signupAs(app, 'creator');
      const body = { name: 'Nope', platform: 'instagram', totalBudget: 1_000, milestones: [] };

      const asCreator = await request(app)
        .post('/api/campaigns')
        .set('Authorization', bearer(token))
        .send(body);
      const anonymous = await request(app).post('/api/campaigns').send(body);

      expect(asCreator.status).toBe(403);
      expect(anonymous.status).toBe(401);
    });

    it('reports every broken ladder rule as 400 INVALID_MILESTONES', async () => {
      const { token } = await signupAs(app, 'brand');
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', bearer(token))
        .send({
          name: 'Bad Ladder',
          platform: 'instagram',
          totalBudget: 1_500,
          milestones: [
            { views: 50_000, payout: 400 },
            { views: 10_000, payout: 500 },
            { views: 100_000, payout: 2_000 },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_MILESTONES');
      expect(res.body.error.details).toEqual([
        {
          path: 'milestones',
          message: 'Payout at 50000 views must be higher than the payout at 10000 views',
        },
        { path: 'milestones', message: 'Top payout (2000) cannot exceed the total budget (1500)' },
      ]);
    });

    it.each([
      ['an unknown platform', { platform: 'tiktok' }],
      ['a fractional budget', { totalBudget: 999.5 }],
      ['a negative budget', { totalBudget: -1 }],
      ['a string milestone value', { milestones: [{ views: '10000', payout: 500 }] }],
      ['a client-supplied spent amount', { spent: 0 }],
    ])('rejects %s with 400 VALIDATION_ERROR', async (_label, override) => {
      const { token } = await signupAs(app, 'brand');
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', bearer(token))
        .send({
          name: 'Campaign',
          platform: 'instagram',
          totalBudget: 6_000,
          milestones: BRIEF_LADDER,
          ...override,
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/campaigns', () => {
    it('lists only live campaigns, newest first, to any signed-in user', async () => {
      const brand = await signupAs(app, 'brand');
      const older = await createCampaignAs(app, brand.token, { name: 'Older' });
      const exhausted = await createCampaignAs(app, brand.token, { name: 'Exhausted' });
      const newer = await createCampaignAs(app, brand.token, { name: 'Newer' });
      await CampaignModel.updateOne(
        { _id: exhausted.id },
        { $set: { spent: 6_000, status: 'exhausted' } },
      );

      const creator = await signupAs(app, 'creator');
      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', bearer(creator.token));

      expect(res.status).toBe(200);
      expect(res.body.campaigns.map((c: { id: string }) => c.id)).toEqual([newer.id, older.id]);
    });

    it('requires authentication', async () => {
      await request(app).get('/api/campaigns').expect(401);
    });
  });

  describe('GET /api/campaigns/mine', () => {
    it("returns only the calling brand's campaigns", async () => {
      const brandA = await signupAs(app, 'brand');
      const brandB = await signupAs(app, 'brand');
      const mine = await createCampaignAs(app, brandA.token, { name: 'Mine' });
      await createCampaignAs(app, brandB.token, { name: 'Theirs' });

      const res = await request(app)
        .get('/api/campaigns/mine')
        .set('Authorization', bearer(brandA.token));

      expect(res.status).toBe(200);
      expect(res.body.campaigns).toEqual([expect.objectContaining({ id: mine.id, name: 'Mine' })]);
    });

    it('is brand-only', async () => {
      const creator = await signupAs(app, 'creator');
      await request(app)
        .get('/api/campaigns/mine')
        .set('Authorization', bearer(creator.token))
        .expect(403);
    });
  });

  describe('GET /api/campaigns/:id', () => {
    it('returns the campaign to its owner', async () => {
      const brand = await signupAs(app, 'brand');
      const campaign = await createCampaignAs(app, brand.token);
      const res = await request(app)
        .get(`/api/campaigns/${campaign.id}`)
        .set('Authorization', bearer(brand.token));
      expect(res.status).toBe(200);
      expect(res.body.campaign).toEqual(campaign);
    });

    it('returns 403 to other brands, 404 for unknown ids and 400 for malformed ids', async () => {
      const owner = await signupAs(app, 'brand');
      const other = await signupAs(app, 'brand');
      const campaign = await createCampaignAs(app, owner.token);

      const forbidden = await request(app)
        .get(`/api/campaigns/${campaign.id}`)
        .set('Authorization', bearer(other.token));
      const missing = await request(app)
        .get(`/api/campaigns/${'0'.repeat(24)}`)
        .set('Authorization', bearer(owner.token));
      const malformed = await request(app)
        .get('/api/campaigns/not-an-id')
        .set('Authorization', bearer(owner.token));

      expect(forbidden.status).toBe(403);
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('CAMPAIGN_NOT_FOUND');
      expect(malformed.status).toBe(400);
      expect(malformed.body.error.code).toBe('INVALID_ID');
    });
  });
});
