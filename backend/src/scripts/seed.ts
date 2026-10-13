/**
 * Seeds demo accounts, campaigns and submissions. Safe to run repeatedly:
 * users are upserted by email, campaigns by brand + name, submissions by post,
 * and view counts go through the real payout service (repeats are no-ops).
 *
 *   npm run seed          (TypeScript, local development)
 *   npm run seed:prod     (compiled, e.g. inside the Docker image)
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import type { Milestone } from '../domain/milestones';
import { canonicalPostKey } from '../domain/post-url';
import type { Platform } from '../domain/platform';
import { connectDb, disconnectDb } from '../lib/db';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { CampaignModel, type CampaignRecord } from '../models/campaign.model';
import { SubmissionModel, type SubmissionRecord } from '../models/submission.model';
import { UserModel, type Role, type UserRecord } from '../models/user.model';
import { applyViewUpdate } from '../modules/submissions/views.service';

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? 'Password123!';

const USERS: { key: string; name: string; email: string; role: Role }[] = [
  { key: 'brand', name: 'Acme Snacks', email: 'brand@memed.test', role: 'brand' },
  { key: 'creatorA', name: 'Desi Meme Lord', email: 'creator@memed.test', role: 'creator' },
  { key: 'creatorB', name: 'Clip Central', email: 'creator2@memed.test', role: 'creator' },
];

const CAMPAIGNS: {
  key: string;
  name: string;
  platform: Platform;
  totalBudget: number;
  milestones: Milestone[];
}[] = [
  {
    key: 'diwali',
    name: 'Diwali Snack Drop',
    platform: 'instagram',
    totalBudget: 6_000,
    milestones: [
      { views: 10_000, payout: 500 },
      { views: 50_000, payout: 2_000 },
      { views: 100_000, payout: 5_000 },
    ],
  },
  {
    key: 'cricket',
    name: 'Cricket Finals Clips',
    platform: 'youtube',
    totalBudget: 25_000,
    milestones: [
      { views: 20_000, payout: 1_000 },
      { views: 100_000, payout: 4_000 },
      { views: 500_000, payout: 12_000 },
    ],
  },
];

// `postedMinutesAgo` backdates the first reading so growth looks organic (two days) or,
// for the reel, fast enough to trip the view-spike flag (12,500 views in 3 minutes).
const SUBMISSIONS: {
  creator: string;
  campaign: string;
  postUrl: string;
  views: number;
  postedMinutesAgo: number;
}[] = [
  {
    creator: 'creatorA',
    campaign: 'diwali',
    postUrl: 'https://www.instagram.com/p/DemoPost001/',
    views: 62_000,
    postedMinutesAgo: 2 * 24 * 60,
  },
  {
    creator: 'creatorB',
    campaign: 'diwali',
    postUrl: 'https://www.instagram.com/reel/DemoReel002/',
    views: 12_500,
    postedMinutesAgo: 3,
  },
  {
    creator: 'creatorA',
    campaign: 'cricket',
    postUrl: 'https://youtu.be/DemoVid0001',
    views: 140_000,
    postedMinutesAgo: 2 * 24 * 60,
  },
];

async function upsertUser(user: (typeof USERS)[number], passwordHash: string): Promise<UserRecord> {
  const existing = await UserModel.findOne({ email: user.email }).lean<UserRecord>();
  if (existing) return existing;
  const created = await UserModel.create({ ...user, passwordHash });
  return created.toObject<UserRecord>();
}

async function upsertCampaign(
  brand: UserRecord,
  campaign: (typeof CAMPAIGNS)[number],
): Promise<CampaignRecord> {
  const existing = await CampaignModel.findOne({
    brand: brand._id,
    name: campaign.name,
  }).lean<CampaignRecord>();
  if (existing) return existing;
  const created = await CampaignModel.create({ ...campaign, brand: brand._id });
  return created.toObject<CampaignRecord>();
}

async function upsertSubmission(
  creator: UserRecord,
  campaign: CampaignRecord,
  postUrl: string,
  postedMinutesAgo: number,
): Promise<SubmissionRecord> {
  const parsed = canonicalPostKey(postUrl, campaign.platform);
  if (!parsed.ok) throw new Error(`Seed post URL is invalid: ${postUrl}`);
  const existing = await SubmissionModel.findOne({ postKey: parsed.key }).lean<SubmissionRecord>();
  if (existing) return existing;
  const created = await SubmissionModel.create({
    campaign: campaign._id,
    creator: creator._id,
    postUrl,
    postKey: parsed.key,
    viewHistory: [{ views: 0, at: new Date(Date.now() - postedMinutesAgo * 60_000), paid: 0 }],
  });
  return created.toObject<SubmissionRecord>();
}

function pick<T>(map: Map<string, T>, key: string): T {
  const value = map.get(key);
  if (!value) throw new Error(`Seed data refers to unknown key "${key}"`);
  return value;
}

async function seed(): Promise<void> {
  await connectDb(env.MONGODB_URI);
  await Promise.all([UserModel.init(), CampaignModel.init(), SubmissionModel.init()]);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, env.BCRYPT_ROUNDS);
  const users = new Map<string, UserRecord>();
  for (const user of USERS) users.set(user.key, await upsertUser(user, passwordHash));

  const brand = pick(users, 'brand');
  const campaigns = new Map<string, CampaignRecord>();
  for (const campaign of CAMPAIGNS)
    campaigns.set(campaign.key, await upsertCampaign(brand, campaign));

  for (const entry of SUBMISSIONS) {
    const submission = await upsertSubmission(
      pick(users, entry.creator),
      pick(campaigns, entry.campaign),
      entry.postUrl,
      entry.postedMinutesAgo,
    );
    try {
      const result = await applyViewUpdate(submission._id.toString(), entry.views);
      logger.info(
        { post: entry.postUrl, views: entry.views, paidNow: result.payout.paidNow },
        'Seeded views',
      );
    } catch (err) {
      // Views already beyond the seed value (e.g. updated by hand since): leave them.
      if (!(err instanceof AppError && err.code === 'VIEWS_DECREASED')) throw err;
    }
  }

  console.log('\nDemo accounts (password: %s)', DEMO_PASSWORD);
  console.table(USERS.map(({ name, email, role }) => ({ role, name, email })));
}

seed()
  .then(() => disconnectDb())
  .catch(async (err: unknown) => {
    logger.fatal({ err }, 'Seed failed');
    await disconnectDb();
    process.exitCode = 1;
  });
