import { formatINR, formatNumber, PLATFORM_LABEL } from '@/lib/format';
import type { CampaignStatus, Milestone, Platform } from '@/lib/types';
import { Badge } from './ui';

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return status === 'live' ? (
    <Badge tone="success" title="Accepting posts: budget is still available">
      Live
    </Badge>
  ) : (
    <Badge
      tone="warning"
      title="The whole budget has been paid out. No new posts, and no further payouts."
    >
      Budget exhausted
    </Badge>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <Badge tone="neutral" title={`Only ${PLATFORM_LABEL[platform]} posts are accepted`}>
      {PLATFORM_LABEL[platform]}
    </Badge>
  );
}

export function FlagBadge({ reason }: { reason?: string }) {
  const why = reason ? `Views jumped unusually fast: ${reason}.` : 'Views jumped unusually fast.';
  return (
    <Badge tone="danger" title={`${why} Flagged for review; the payout still went through.`}>
      Flagged
    </Badge>
  );
}

/** The payout ladder as a compact list: "10,000 views → ₹500". */
export function MilestoneLadder({ milestones }: { milestones: Milestone[] }) {
  return (
    <ol className="flex flex-wrap gap-1.5 text-xs">
      {milestones.map((m) => (
        <li
          key={m.views}
          title={`A post that reaches ${formatNumber(m.views)} views earns ${formatINR(m.payout)} in total (milestones do not add up)`}
          className="rounded-md bg-slate-100 px-2 py-1 text-slate-700"
        >
          {formatNumber(m.views)} views → <strong>{formatINR(m.payout)}</strong>
        </li>
      ))}
    </ol>
  );
}
