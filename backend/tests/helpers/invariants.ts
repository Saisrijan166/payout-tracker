import { entitledPayout } from '../../src/domain/payout';
import { CampaignModel, type CampaignRecord } from '../../src/models/campaign.model';
import {
  SubmissionModel,
  VIEW_HISTORY_LIMIT,
  type SubmissionRecord,
} from '../../src/models/submission.model';

/**
 * Asserts the payout invariants from IMPLEMENTATION_PLAN.md section 4 against the stored data:
 * I1 spent <= totalBudget
 * I2 spent = sum of paidAmount
 * I3 0 <= paidAmount <= entitledAmount, and entitledAmount matches the ladder at the stored views
 * I4 view history only moves forward and its payments add up to paidAmount
 * I5 status is 'exhausted' exactly when spent = totalBudget
 */
export async function assertInvariants(campaignId: string): Promise<void> {
  const campaign = await CampaignModel.findById(campaignId).lean<CampaignRecord>();
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);
  const submissions = await SubmissionModel.find({ campaign: campaignId }).lean<
    SubmissionRecord[]
  >();

  expect(campaign.spent).toBeLessThanOrEqual(campaign.totalBudget); // I1
  expect(submissions.reduce((sum, s) => sum + s.paidAmount, 0)).toBe(campaign.spent); // I2

  for (const s of submissions) {
    expect(s.paidAmount).toBeGreaterThanOrEqual(0); // I3
    expect(s.paidAmount).toBeLessThanOrEqual(s.entitledAmount);
    expect(s.entitledAmount).toBe(entitledPayout(campaign.milestones, s.views));

    const readings = s.viewHistory.map((r) => r.views); // I4
    expect(readings).toEqual([...readings].sort((a, b) => a - b));
    if (s.viewHistory.length < VIEW_HISTORY_LIMIT) {
      expect(s.viewHistory.reduce((sum, r) => sum + r.paid, 0)).toBe(s.paidAmount);
    }
  }

  expect(campaign.status === 'exhausted').toBe(campaign.spent === campaign.totalBudget); // I5
}
