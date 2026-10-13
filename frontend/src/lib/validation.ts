// Client-side checks that mirror the API's ladder rules for instant feedback.
// The API remains the source of truth and re-validates everything.

export const MAX_MILESTONES = 10;

export interface MilestoneDraft {
  views: string;
  payout: string;
}

export interface CampaignDraft {
  name: string;
  totalBudget: string;
  milestones: MilestoneDraft[];
}

const toPositiveInteger = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export function validateCampaignDraft(draft: CampaignDraft): {
  issues: string[];
  totalBudget: number | null;
  milestones: { views: number; payout: number }[];
} {
  const issues: string[] = [];
  if (draft.name.trim().length < 3) issues.push('Name must be at least 3 characters');

  const totalBudget = toPositiveInteger(draft.totalBudget);
  if (totalBudget === null) issues.push('Budget must be a whole number of rupees above zero');

  if (draft.milestones.length === 0) issues.push('Add at least one milestone');
  if (draft.milestones.length > MAX_MILESTONES)
    issues.push(`Use at most ${MAX_MILESTONES} milestones`);

  const milestones: { views: number; payout: number }[] = [];
  draft.milestones.forEach((row, index) => {
    const views = toPositiveInteger(row.views);
    const payout = toPositiveInteger(row.payout);
    if (views === null)
      issues.push(`Milestone ${index + 1}: views must be a positive whole number`);
    if (payout === null)
      issues.push(`Milestone ${index + 1}: payout must be a positive whole number`);
    if (views !== null && payout !== null) milestones.push({ views, payout });
  });

  const sorted = [...milestones].sort((a, b) => a.views - b.views);
  sorted.forEach((current, index) => {
    const previous = sorted[index - 1];
    if (!previous) return;
    if (current.views === previous.views) {
      issues.push(`View threshold ${current.views} is used more than once`);
    } else if (current.payout <= previous.payout) {
      issues.push(
        `Payout at ${current.views} views must be higher than at ${previous.views} views`,
      );
    }
  });

  const top = sorted[sorted.length - 1];
  if (top && totalBudget !== null && top.payout > totalBudget) {
    issues.push('The top milestone payout cannot exceed the total budget');
  }

  return { issues, totalBudget, milestones: sorted };
}
