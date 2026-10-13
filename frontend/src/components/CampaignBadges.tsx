import { formatINR, formatNumber, PLATFORM_LABEL } from '@/lib/format';
import type { CampaignStatus, Milestone, Platform } from '@/lib/types';
import { Badge } from './ui';

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return status === 'live' ? (
    <Badge tone="success">Live</Badge>
  ) : (
    <Badge tone="warning">Budget exhausted</Badge>
  );
}

export function PlatformBadge({ platform }: { platform: Platform }) {
  return <Badge tone="neutral">{PLATFORM_LABEL[platform]}</Badge>;
}

export function FlagBadge({ reason }: { reason?: string }) {
  return (
    <Badge tone="danger" title={reason}>
      Flagged
    </Badge>
  );
}

/** The payout ladder as a compact list: "10,000 views → ₹500". */
export function MilestoneLadder({ milestones }: { milestones: Milestone[] }) {
  return (
    <ol className="flex flex-wrap gap-1.5 text-xs">
      {milestones.map((m) => (
        <li key={m.views} className="rounded-md bg-slate-100 px-2 py-1 text-slate-700">
          {formatNumber(m.views)} views → <strong>{formatINR(m.payout)}</strong>
        </li>
      ))}
    </ol>
  );
}
