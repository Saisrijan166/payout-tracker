import type { Milestone } from '../../domain/milestones';
import type { Platform } from '../../domain/platform';
import type { CampaignRecord, CampaignStatus } from '../../models/campaign.model';

export interface CampaignDTO {
  id: string;
  brandId: string;
  name: string;
  platform: Platform;
  totalBudget: number;
  spent: number;
  remaining: number;
  milestones: Milestone[];
  status: CampaignStatus;
  createdAt: string;
}

/** A brand's view of its own campaign, with submission activity. */
export interface BrandCampaignDTO extends CampaignDTO {
  submissionCount: number;
  flaggedCount: number;
}

export function toCampaignDTO(campaign: CampaignRecord): CampaignDTO {
  return {
    id: campaign._id.toString(),
    brandId: campaign.brand.toString(),
    name: campaign.name,
    platform: campaign.platform,
    totalBudget: campaign.totalBudget,
    spent: campaign.spent,
    remaining: campaign.totalBudget - campaign.spent,
    milestones: campaign.milestones.map(({ views, payout }) => ({ views, payout })),
    status: campaign.status,
    createdAt: campaign.createdAt.toISOString(),
  };
}
