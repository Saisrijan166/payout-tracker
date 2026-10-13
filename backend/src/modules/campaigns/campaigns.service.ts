import { Types } from 'mongoose';
import { parseMilestoneLadder } from '../../domain/milestones';
import { AppError } from '../../lib/errors';
import { CampaignModel, type CampaignRecord } from '../../models/campaign.model';
import { countSubmissionsByCampaign } from '../submissions/submissions.service';
import {
  invalidateLiveCampaigns,
  isCacheEnabled,
  readLiveCampaigns,
  writeLiveCampaigns,
} from './campaigns.cache';
import { toCampaignDTO, type BrandCampaignDTO, type CampaignDTO } from './campaigns.dto';
import type { CreateCampaignInput } from './campaigns.schemas';

/** The live list is capped; pagination is noted in SCALING.md. */
const LIVE_LIST_LIMIT = 100;

export async function createCampaign(
  brandId: string,
  input: CreateCampaignInput,
): Promise<CampaignDTO> {
  const result = parseMilestoneLadder(input.milestones, input.totalBudget);
  if (!result.ok) {
    throw new AppError(
      400,
      'INVALID_MILESTONES',
      'The milestone ladder is invalid',
      result.issues.map((message) => ({ path: 'milestones', message })),
    );
  }

  const campaign = await CampaignModel.create({
    brand: new Types.ObjectId(brandId),
    name: input.name,
    platform: input.platform,
    totalBudget: input.totalBudget,
    milestones: result.ladder,
  });
  await invalidateLiveCampaigns();
  return toCampaignDTO(campaign.toObject<CampaignRecord>());
}

export type CacheStatus = 'HIT' | 'MISS' | 'BYPASS';

/** Live campaigns, newest first, served from Redis when possible (cache-aside). */
export async function listLiveCampaigns(): Promise<{
  campaigns: CampaignDTO[];
  cache: CacheStatus;
}> {
  const cached = await readLiveCampaigns();
  if (cached) return { campaigns: cached, cache: 'HIT' };

  const campaigns = (
    await CampaignModel.find({ status: 'live' })
      .sort({ createdAt: -1, _id: -1 })
      .limit(LIVE_LIST_LIMIT)
      .lean<CampaignRecord[]>()
  ).map(toCampaignDTO);

  if (!isCacheEnabled()) return { campaigns, cache: 'BYPASS' };
  await writeLiveCampaigns(campaigns);
  return { campaigns, cache: 'MISS' };
}

export async function listBrandCampaigns(brandId: string): Promise<BrandCampaignDTO[]> {
  const campaigns = await CampaignModel.find({ brand: brandId })
    .sort({ createdAt: -1, _id: -1 })
    .lean<CampaignRecord[]>();
  const counts = await countSubmissionsByCampaign(campaigns.map((c) => c._id));
  return campaigns.map((campaign) => ({
    ...toCampaignDTO(campaign),
    ...(counts.get(campaign._id.toString()) ?? { submissionCount: 0, flaggedCount: 0 }),
  }));
}

/** Loads a campaign for its owning brand: 404 if missing, 403 if another brand owns it. */
export async function getOwnedCampaign(
  brandId: string,
  campaignId: string,
): Promise<CampaignRecord> {
  const campaign = await CampaignModel.findById(campaignId).lean<CampaignRecord>();
  if (!campaign) {
    throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  }
  if (!campaign.brand.equals(brandId)) {
    throw new AppError(403, 'FORBIDDEN', 'You can only view your own campaigns');
  }
  return campaign;
}
