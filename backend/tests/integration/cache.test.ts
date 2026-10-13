import request from 'supertest';
import { createApp } from '../../src/app';
import { connectRedis, disconnectRedis, getRedis } from '../../src/lib/redis';
import { bearer, signupAs } from '../helpers/auth';
import { createCampaignAs } from '../helpers/campaigns';
import { patchViews, submitPostAs } from '../helpers/submissions';
import { useTestDb } from '../setup/db';

const app = createApp();

describe('campaign list cache', () => {
  useTestDb();

  describe('without Redis configured', () => {
    it('serves the list from MongoDB and reports the cache as bypassed', async () => {
      const brand = await signupAs(app, 'brand');
      await createCampaignAs(app, brand.token);

      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', bearer(brand.token));
      expect(res.status).toBe(200);
      expect(res.headers['x-cache']).toBe('BYPASS');
      expect(res.body.campaigns).toHaveLength(1);
    });
  });

  describe('with Redis down', () => {
    // Nothing listens on port 1, so every connection attempt fails.
    beforeAll(() => connectRedis('redis://127.0.0.1:1'));
    afterAll(() => disconnectRedis());

    it('keeps serving from MongoDB and reports Redis as down in /health', async () => {
      const brand = await signupAs(app, 'brand');
      const campaign = await createCampaignAs(app, brand.token); // invalidation must not throw

      const list = await request(app)
        .get('/api/campaigns')
        .set('Authorization', bearer(brand.token));
      const health = await request(app).get('/api/health');

      expect(list.status).toBe(200);
      expect(list.headers['x-cache']).toBe('BYPASS');
      expect(list.body.campaigns.map((c: { id: string }) => c.id)).toEqual([campaign.id]);
      expect(health.status).toBe(200);
      expect(health.body).toEqual({ status: 'ok', db: 'up', redis: 'down' });
    });
  });

  // Runs only when a real Redis is available, e.g. TEST_REDIS_URL=redis://localhost:6379.
  const describeWithRedis = process.env.TEST_REDIS_URL ? describe : describe.skip;

  describeWithRedis('with Redis up', () => {
    beforeAll(async () => {
      await connectRedis(process.env.TEST_REDIS_URL);
      await getRedis()?.flushdb();
    });
    afterAll(() => disconnectRedis());
    afterEach(async () => {
      await getRedis()?.flushdb();
    });

    it('caches the live list and invalidates it on create and on budget exhaustion', async () => {
      const brand = await signupAs(app, 'brand');
      const creator = await signupAs(app, 'creator');
      const list = () =>
        request(app).get('/api/campaigns').set('Authorization', bearer(creator.token));

      const small = await createCampaignAs(app, brand.token, {
        name: 'Small',
        totalBudget: 500,
        milestones: [{ views: 10, payout: 500 }],
      });

      const first = await list();
      const second = await list();
      expect(first.headers['x-cache']).toBe('MISS');
      expect(second.headers['x-cache']).toBe('HIT');
      expect(second.body).toEqual(first.body);

      // Creating a campaign invalidates the cached list.
      const big = await createCampaignAs(app, brand.token, { name: 'Big' });
      const afterCreate = await list();
      expect(afterCreate.headers['x-cache']).toBe('MISS');
      expect(afterCreate.body.campaigns.map((c: { id: string }) => c.id)).toEqual([
        big.id,
        small.id,
      ]);

      // Exhausting a campaign's budget removes it from the cached list.
      await list(); // warm the cache again
      const submission = await submitPostAs(app, creator.token, small.id);
      await patchViews(app, submission.id, 10).expect(200);
      const afterExhaustion = await list();
      expect(afterExhaustion.headers['x-cache']).toBe('MISS');
      expect(afterExhaustion.body.campaigns.map((c: { id: string }) => c.id)).toEqual([big.id]);
    });
  });
});
