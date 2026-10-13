import { Types } from 'mongoose';
import { canonicalPostKey } from '../../domain/post-url';
import { AppError, isDuplicateKeyError } from '../../lib/errors';
import { CampaignModel, type CampaignRecord } from '../../models/campaign.model';
import { SubmissionModel, type SubmissionRecord } from '../../models/submission.model';
import { UserModel, type UserRecord } from '../../models/user.model';
import {
  toSubmissionDTO,
  type CampaignSummary,
  type CreatorSummary,
  type SubmissionDTO,
} from './submissions.dto';
import type { CreateSubmissionInput } from './submissions.schemas';

const PLATFORM_LABEL = { instagram: 'Instagram', youtube: 'YouTube' } as const;

const duplicate = (): AppError =>
  new AppError(409, 'DUPLICATE_SUBMISSION', 'This post has already been submitted to a campaign');

function campaignSummary(
  campaign: Pick<CampaignRecord, '_id' | 'name' | 'platform'>,
): CampaignSummary {
  return { id: campaign._id.toString(), name: campaign.name, platform: campaign.platform };
}

export async function createSubmission(
  creatorId: string,
  input: CreateSubmissionInput,
): Promise<SubmissionDTO> {
  const campaign = await CampaignModel.findById(input.campaignId).lean<CampaignRecord>();
  if (!campaign) {
    throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  }
  if (campaign.status !== 'live') {
    throw new AppError(
      409,
      'CAMPAIGN_NOT_LIVE',
      'This campaign has used its full budget and is no longer accepting posts',
    );
  }

  const parsed = canonicalPostKey(input.postUrl, campaign.platform);
  if (!parsed.ok) {
    throw parsed.reason === 'PLATFORM_MISMATCH'
      ? new AppError(
          400,
          'PLATFORM_MISMATCH',
          `This campaign only accepts ${PLATFORM_LABEL[campaign.platform]} posts`,
        )
      : new AppError(
          400,
          'INVALID_POST_URL',
          'Enter a link to a single Instagram post or reel, or a YouTube video',
        );
  }

  if (await SubmissionModel.exists({ postKey: parsed.key })) {
    throw duplicate();
  }

  try {
    const submission = await SubmissionModel.create({
      campaign: campaign._id,
      creator: new Types.ObjectId(creatorId),
      postUrl: input.postUrl,
      postKey: parsed.key,
      viewHistory: [{ views: 0, at: new Date(), paid: 0 }],
    });
    return toSubmissionDTO(submission.toObject<SubmissionRecord>(), {
      campaign: campaignSummary(campaign),
    });
  } catch (err) {
    // Two submissions of the same post racing past exists(): the unique index decides.
    if (isDuplicateKeyError(err)) throw duplicate();
    throw err;
  }
}

export interface CreatorEarnings {
  summary: {
    totalEarned: number;
    totalEntitled: number;
    totalUnpaid: number;
    submissionCount: number;
  };
  submissions: SubmissionDTO[];
}

export async function listCreatorSubmissions(creatorId: string): Promise<CreatorEarnings> {
  const submissions = await SubmissionModel.find({ creator: creatorId })
    .sort({ createdAt: -1, _id: -1 })
    .lean<SubmissionRecord[]>();

  const campaignIds = [...new Set(submissions.map((s) => s.campaign.toString()))];
  const campaigns = await CampaignModel.find({ _id: { $in: campaignIds } })
    .select('name platform')
    .lean<Pick<CampaignRecord, '_id' | 'name' | 'platform'>[]>();
  const campaignById = new Map(campaigns.map((c) => [c._id.toString(), campaignSummary(c)]));

  const dtos = submissions.map((s) =>
    toSubmissionDTO(s, { campaign: campaignById.get(s.campaign.toString()) }),
  );
  return {
    summary: {
      totalEarned: dtos.reduce((sum, s) => sum + s.paidAmount, 0),
      totalEntitled: dtos.reduce((sum, s) => sum + s.entitledAmount, 0),
      totalUnpaid: dtos.reduce((sum, s) => sum + s.unpaidAmount, 0),
      submissionCount: dtos.length,
    },
    submissions: dtos,
  };
}

/** All submissions for one campaign, with creator names, for the owning brand. */
export async function listCampaignSubmissions(campaignId: string): Promise<SubmissionDTO[]> {
  const submissions = await SubmissionModel.find({ campaign: campaignId })
    .sort({ createdAt: -1, _id: -1 })
    .lean<SubmissionRecord[]>();

  const creatorIds = [...new Set(submissions.map((s) => s.creator.toString()))];
  const creators = await UserModel.find({ _id: { $in: creatorIds } })
    .select('name')
    .lean<Pick<UserRecord, '_id' | 'name'>[]>();
  const creatorById = new Map<string, CreatorSummary>(
    creators.map((c) => [c._id.toString(), { id: c._id.toString(), name: c.name }]),
  );

  return submissions.map((s) =>
    toSubmissionDTO(s, { creator: creatorById.get(s.creator.toString()) }),
  );
}

export interface SubmissionCounts {
  submissionCount: number;
  flaggedCount: number;
}

/** Submission and flagged counts per campaign, keyed by campaign id. */
export async function countSubmissionsByCampaign(
  campaignIds: Types.ObjectId[],
): Promise<Map<string, SubmissionCounts>> {
  const rows = await SubmissionModel.aggregate<{ _id: Types.ObjectId } & SubmissionCounts>([
    { $match: { campaign: { $in: campaignIds } } },
    {
      $group: {
        _id: '$campaign',
        submissionCount: { $sum: 1 },
        flaggedCount: { $sum: { $cond: ['$flagged', 1, 0] } },
      },
    },
  ]);
  return new Map(
    rows.map((row) => [
      row._id.toString(),
      { submissionCount: row.submissionCount, flaggedCount: row.flaggedCount },
    ]),
  );
}
