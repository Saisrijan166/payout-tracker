// Client-side checks that mirror the API's ladder rules for instant feedback.
// The API remains the source of truth and re-validates everything.
import { formatINR, formatNumber } from './format';

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

/** Errors keyed by the field they belong to, so each can be shown under that field. */
export interface CampaignFieldErrors {
  name?: string;
  totalBudget?: string;
  /** Problems with the ladder as a whole (none, or too many rungs). */
  ladder?: string;
  /** Per milestone row, by its index in the form. */
  rows: Record<number, { views?: string; payout?: string }>;
}

const toPositiveInteger = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

export function validateCampaignDraft(draft: CampaignDraft): {
  valid: boolean;
  errors: CampaignFieldErrors;
  totalBudget: number | null;
  milestones: { views: number; payout: number }[];
} {
  const errors: CampaignFieldErrors = { rows: {} };
  const rowError = (index: number, field: 'views' | 'payout', message: string) => {
    const row = (errors.rows[index] ??= {});
    row[field] ??= message;
  };

  if (draft.name.trim().length < 3) errors.name = 'Use at least 3 characters';

  const totalBudget = toPositiveInteger(draft.totalBudget);
  if (totalBudget === null) errors.totalBudget = 'Enter a whole number of rupees above 0';

  if (draft.milestones.length === 0) errors.ladder = 'Add at least one milestone';
  if (draft.milestones.length > MAX_MILESTONES) {
    errors.ladder = `Use at most ${MAX_MILESTONES} milestones`;
  }

  const parsed: { index: number; views: number; payout: number }[] = [];
  draft.milestones.forEach((row, index) => {
    const views = toPositiveInteger(row.views);
    const payout = toPositiveInteger(row.payout);
    if (views === null) rowError(index, 'views', 'Enter a whole number above 0');
    if (payout === null) rowError(index, 'payout', 'Enter a whole number above 0');
    if (views !== null && payout !== null) parsed.push({ index, views, payout });
  });

  // Same ladder rules as the API: unique thresholds, payouts rising with views.
  const sorted = [...parsed].sort((a, b) => a.views - b.views);
  sorted.forEach((current, i) => {
    const previous = sorted[i - 1];
    if (!previous) return;
    if (current.views === previous.views) {
      rowError(current.index, 'views', `Same views as milestone ${previous.index + 1}`);
    } else if (current.payout <= previous.payout) {
      rowError(
        current.index,
        'payout',
        `Must be more than ${formatINR(previous.payout)} (paid at ${formatNumber(previous.views)} views)`,
      );
    }
  });

  const top = sorted[sorted.length - 1];
  if (top && totalBudget !== null && top.payout > totalBudget) {
    errors.totalBudget = `Must cover the top payout of ${formatINR(top.payout)}`;
  }

  const valid =
    !errors.name && !errors.totalBudget && !errors.ladder && Object.keys(errors.rows).length === 0;
  return {
    valid,
    errors,
    totalBudget,
    milestones: sorted.map(({ views, payout }) => ({ views, payout })),
  };
}
