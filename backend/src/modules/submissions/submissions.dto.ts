import type { Platform } from '../../domain/platform';
import type { CampaignRecord } from '../../models/campaign.model';
import type { SubmissionRecord } from '../../models/submission.model';

export interface CampaignSummary {
  id: string;
  name: string;
  platform: Platform;
}

export interface CreatorSummary {
  id: string;
  name: string;
}

export interface SubmissionDTO {
  id: string;
  campaignId: string;
  campaign?: CampaignSummary;
  creatorId: string;
  creator?: CreatorSummary;
  postUrl: string;
  views: number;
  entitledAmount: number;
  paidAmount: number;
  /** Earned but not paid because the campaign budget ran out. */
  unpaidAmount: number;
  flagged: boolean;
  flagReason?: string;
  lastViewsAt: string;
  createdAt: string;
}

export function toCampaignSummary(
  campaign: Pick<CampaignRecord, '_id' | 'name' | 'platform'>,
): CampaignSummary {
  return { id: campaign._id.toString(), name: campaign.name, platform: campaign.platform };
}

export function toSubmissionDTO(
  submission: SubmissionRecord,
  refs: { campaign?: CampaignSummary; creator?: CreatorSummary } = {},
): SubmissionDTO {
  const lastReading = submission.viewHistory[submission.viewHistory.length - 1];
  return {
    id: submission._id.toString(),
    campaignId: submission.campaign.toString(),
    campaign: refs.campaign,
    creatorId: submission.creator.toString(),
    creator: refs.creator,
    postUrl: submission.postUrl,
    views: submission.views,
    entitledAmount: submission.entitledAmount,
    paidAmount: submission.paidAmount,
    unpaidAmount: Math.max(0, submission.entitledAmount - submission.paidAmount),
    flagged: submission.flagged,
    flagReason: submission.flagReason,
    lastViewsAt: (lastReading?.at ?? submission.createdAt).toISOString(),
    createdAt: submission.createdAt.toISOString(),
  };
}
