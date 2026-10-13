import mongoose, { type ClientSession, type Types } from 'mongoose';
import { env } from '../../config/env';
import { planViewUpdate } from '../../domain/payout';
import { describeSpike, detectViewSpike } from '../../domain/spike';
import { AppError } from '../../lib/errors';
import {
  CampaignModel,
  type CampaignRecord,
  type CampaignStatus,
} from '../../models/campaign.model';
import {
  SubmissionModel,
  VIEW_HISTORY_LIMIT,
  type SubmissionRecord,
} from '../../models/submission.model';
import { invalidateLiveCampaigns } from '../campaigns/campaigns.cache';
import { toCampaignSummary, toSubmissionDTO, type SubmissionDTO } from './submissions.dto';

export interface ViewUpdateResult {
  submission: SubmissionDTO;
  payout: { entitled: number; paidNow: number; paidTotal: number; unpaid: number };
  campaign: { id: string; spent: number; remaining: number; status: CampaignStatus };
}

/** A guarded write matched nothing: another update changed the documents first. */
class StaleReadError extends Error {
  constructor() {
    super('Payout state changed during the update');
    this.name = 'StaleReadError';
  }
}

const MAX_ATTEMPTS = 3;

/**
 * Records a new view count for a submission and pays any newly earned amount.
 *
 * Safety comes from the database, not just this code:
 * - Both writes run in one transaction, so the campaign's `spent` and the
 *   submission's `paidAmount` always move together (spent = sum of paidAmount).
 * - The campaign update only matches if `spent + grant <= totalBudget`, so the
 *   budget can never be exceeded, even by a write based on a stale read.
 * - The submission update only matches if `views` and `paidAmount` are still
 *   what was read, so two identical updates can never both pay the same delta.
 * Concurrent transactions that touch the same documents hit a write conflict,
 * which the driver retries; a guard that matches nothing triggers a re-read here.
 */
export async function applyViewUpdate(
  submissionId: string,
  newViews: number,
  now: Date = new Date(),
): Promise<ViewUpdateResult> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await mongoose.connection.transaction((session) =>
        runViewUpdate(session, submissionId, newViews, now),
      );
      // After commit (never inside the transaction, which may retry): a payout changed
      // the campaign's remaining budget, and may have exhausted it, so the cached
      // live list is stale.
      if (result.payout.paidNow > 0) await invalidateLiveCampaigns();
      return result;
    } catch (err) {
      if (!(err instanceof StaleReadError)) throw err;
    }
  }
  throw new AppError(
    409,
    'CONCURRENT_UPDATE',
    'The submission changed while its views were being updated. Please retry.',
    { retryable: true },
  );
}

async function runViewUpdate(
  session: ClientSession,
  submissionId: string,
  newViews: number,
  now: Date,
): Promise<ViewUpdateResult> {
  const submission = await SubmissionModel.findById(submissionId)
    .session(session)
    .lean<SubmissionRecord>();
  if (!submission) {
    throw new AppError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found');
  }
  const campaign = await CampaignModel.findById(submission.campaign)
    .session(session)
    .lean<CampaignRecord>();
  if (!campaign) {
    throw new AppError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign for this submission not found');
  }

  const plan = planViewUpdate({
    ladder: campaign.milestones,
    currentViews: submission.views,
    newViews,
    alreadyPaid: submission.paidAmount,
    totalBudget: campaign.totalBudget,
    spent: campaign.spent,
  });

  if (plan.kind === 'rejected') {
    throw new AppError(
      409,
      'VIEWS_DECREASED',
      `View count cannot go down (currently ${submission.views})`,
      { currentViews: submission.views },
    );
  }
  if (plan.kind === 'unchanged') {
    return buildResult(submission, campaign, 0);
  }

  let updatedCampaign = campaign;
  if (plan.grant > 0) {
    const reserved = await reserveBudget(campaign._id, plan.grant, session);
    if (!reserved) throw new StaleReadError();
    updatedCampaign = reserved;
  }

  // Flag unusually fast growth for review. Informational only: the payout still goes through.
  const previous = submission.viewHistory.at(-1) ?? { views: 0, at: submission.createdAt };
  const spike = detectViewSpike(previous, newViews, now, {
    minGain: env.SPIKE_MIN_GAIN,
    viewsPerMinute: env.SPIKE_VIEWS_PER_MIN,
  });
  const flagReason = spike.isSpike && !submission.flagged ? describeSpike(spike) : undefined;

  const updatedSubmission = await recordReading(
    submission,
    { views: newViews, entitled: plan.entitled, paid: plan.grant, at: now, flagReason },
    session,
  );
  if (!updatedSubmission) throw new StaleReadError();

  return buildResult(updatedSubmission, updatedCampaign, plan.grant);
}

/**
 * Atomically adds `grant` to the campaign's spent amount, but only if the result
 * stays within totalBudget, and marks the campaign exhausted when it reaches it.
 * Returns null (and changes nothing) if the grant would overspend.
 */
export function reserveBudget(
  campaignId: Types.ObjectId,
  grant: number,
  session?: ClientSession,
): Promise<CampaignRecord | null> {
  return CampaignModel.findOneAndUpdate(
    { _id: campaignId, $expr: { $lte: [{ $add: ['$spent', grant] }, '$totalBudget'] } },
    // Pipeline update: `status` is computed from the new `spent` in the same atomic write.
    [
      { $set: { spent: { $add: ['$spent', grant] } } },
      {
        $set: {
          status: { $cond: [{ $gte: ['$spent', '$totalBudget'] }, 'exhausted', '$status'] },
        },
      },
    ],
    { new: true, session },
  )
    .lean<CampaignRecord>()
    .exec();
}

/**
 * Atomically records a reading and payment on a submission, but only if its
 * views and paidAmount are still the values the payout was planned from.
 * Returns null (and changes nothing) if another update got there first.
 */
export function recordReading(
  expected: Pick<SubmissionRecord, '_id' | 'views' | 'paidAmount'>,
  reading: { views: number; entitled: number; paid: number; at: Date; flagReason?: string },
  session?: ClientSession,
): Promise<SubmissionRecord | null> {
  return SubmissionModel.findOneAndUpdate(
    { _id: expected._id, views: expected.views, paidAmount: expected.paidAmount },
    {
      $set: {
        views: reading.views,
        entitledAmount: reading.entitled,
        ...(reading.flagReason && {
          flagged: true,
          flagReason: reading.flagReason,
          flaggedAt: reading.at,
        }),
      },
      $inc: { paidAmount: reading.paid },
      $push: {
        viewHistory: {
          $each: [{ views: reading.views, at: reading.at, paid: reading.paid }],
          $slice: -VIEW_HISTORY_LIMIT,
        },
      },
    },
    { new: true, session },
  )
    .lean<SubmissionRecord>()
    .exec();
}

function buildResult(
  submission: SubmissionRecord,
  campaign: CampaignRecord,
  paidNow: number,
): ViewUpdateResult {
  const dto = toSubmissionDTO(submission, { campaign: toCampaignSummary(campaign) });
  return {
    submission: dto,
    payout: {
      entitled: dto.entitledAmount,
      paidNow,
      paidTotal: dto.paidAmount,
      unpaid: dto.unpaidAmount,
    },
    campaign: {
      id: campaign._id.toString(),
      spent: campaign.spent,
      remaining: campaign.totalBudget - campaign.spent,
      status: campaign.status,
    },
  };
}
