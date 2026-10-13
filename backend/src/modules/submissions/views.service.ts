import mongoose, { type ClientSession } from 'mongoose';
import { planViewUpdate } from '../../domain/payout';
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
import { toCampaignSummary, toSubmissionDTO, type SubmissionDTO } from './submissions.dto';

export interface ViewUpdateResult {
  submission: SubmissionDTO;
  payout: { entitled: number; paidNow: number; paidTotal: number; unpaid: number };
  campaign: { id: string; spent: number; remaining: number; status: CampaignStatus };
}

interface TransactionOutcome {
  result: ViewUpdateResult;
  /** True when this update used up the last of the campaign budget. */
  exhaustedNow: boolean;
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
      const outcome = await mongoose.connection.transaction((session) =>
        runViewUpdate(session, submissionId, newViews, now),
      );
      return outcome.result;
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
): Promise<TransactionOutcome> {
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
    return { result: buildResult(submission, campaign, 0), exhaustedNow: false };
  }

  let updatedCampaign = campaign;
  if (plan.grant > 0) {
    const guarded = await CampaignModel.findOneAndUpdate(
      {
        _id: campaign._id,
        $expr: { $lte: [{ $add: ['$spent', plan.grant] }, '$totalBudget'] },
      },
      // Pipeline update: `status` is computed from the new `spent` in the same atomic write.
      [
        { $set: { spent: { $add: ['$spent', plan.grant] } } },
        {
          $set: {
            status: { $cond: [{ $gte: ['$spent', '$totalBudget'] }, 'exhausted', '$status'] },
          },
        },
      ],
      { new: true, session },
    ).lean<CampaignRecord>();
    if (!guarded) throw new StaleReadError();
    updatedCampaign = guarded;
  }

  const updatedSubmission = await SubmissionModel.findOneAndUpdate(
    { _id: submission._id, views: submission.views, paidAmount: submission.paidAmount },
    {
      $set: { views: newViews, entitledAmount: plan.entitled },
      $inc: { paidAmount: plan.grant },
      $push: {
        viewHistory: {
          $each: [{ views: newViews, at: now, paid: plan.grant }],
          $slice: -VIEW_HISTORY_LIMIT,
        },
      },
    },
    { new: true, session },
  ).lean<SubmissionRecord>();
  if (!updatedSubmission) throw new StaleReadError();

  return {
    result: buildResult(updatedSubmission, updatedCampaign, plan.grant),
    exhaustedNow: campaign.status === 'live' && updatedCampaign.status === 'exhausted',
  };
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
