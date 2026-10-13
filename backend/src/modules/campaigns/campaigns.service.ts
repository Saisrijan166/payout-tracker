import { Types } from 'mongoose';
import { parseMilestoneLadder } from '../../domain/milestones';
import { AppError } from '../../lib/errors';
import { CampaignModel, type CampaignRecord } from '../../models/campaign.model';
import { toCampaignDTO, type CampaignDTO } from './campaigns.dto';
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
  return toCampaignDTO(campaign.toObject<CampaignRecord>());
}

export async function listLiveCampaigns(): Promise<CampaignDTO[]> {
  const campaigns = await CampaignModel.find({ status: 'live' })
    .sort({ createdAt: -1, _id: -1 })
    .limit(LIVE_LIST_LIMIT)
    .lean<CampaignRecord[]>();
  return campaigns.map(toCampaignDTO);
}

export async function listBrandCampaigns(brandId: string): Promise<CampaignDTO[]> {
  const campaigns = await CampaignModel.find({ brand: brandId })
    .sort({ createdAt: -1, _id: -1 })
    .lean<CampaignRecord[]>();
  return campaigns.map(toCampaignDTO);
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
