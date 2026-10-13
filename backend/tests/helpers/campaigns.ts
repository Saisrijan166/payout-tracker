import type { Express } from 'express';
import request from 'supertest';
import type { Milestone } from '../../src/domain/milestones';
import type { CampaignDTO } from '../../src/modules/campaigns/campaigns.dto';
import { bearer } from './auth';

/** The ladder from the brief: 10K -> ₹500, 50K -> ₹2,000, 100K -> ₹5,000. */
export const BRIEF_LADDER: Milestone[] = [
  { views: 10_000, payout: 500 },
  { views: 50_000, payout: 2_000 },
  { views: 100_000, payout: 5_000 },
];

export interface CampaignOverrides {
  name?: string;
  platform?: 'instagram' | 'youtube';
  totalBudget?: number;
  milestones?: Milestone[];
}

export async function createCampaignAs(
  app: Express,
  token: string,
  overrides: CampaignOverrides = {},
): Promise<CampaignDTO> {
  const res = await request(app)
    .post('/api/campaigns')
    .set('Authorization', bearer(token))
    .send({
      name: 'Diwali Drop',
      platform: 'instagram',
      totalBudget: 6_000,
      milestones: BRIEF_LADDER,
      ...overrides,
    });
  if (res.status !== 201) {
    throw new Error(`campaign create failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { campaign: CampaignDTO }).campaign;
}
