import type { ReactNode } from 'react';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import type { Submission } from '@/lib/types';
import { FlagBadge } from './CampaignBadges';

interface SubmissionsTableProps {
  submissions: Submission[];
  /** Brand view: show who submitted each post. */
  showCreator?: boolean;
  /** Creator view: show which campaign each post belongs to. */
  showCampaign?: boolean;
  /** Optional extra column, e.g. the "simulate views" control. */
  renderAction?: (submission: Submission) => ReactNode;
  actionLabel?: string;
}

export function SubmissionsTable({
  submissions,
  showCreator = false,
  showCampaign = false,
  renderAction,
  actionLabel = 'Action',
}: SubmissionsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
          <tr>
            {showCreator && <th className="px-3 py-2">Creator</th>}
            {showCampaign && <th className="px-3 py-2">Campaign</th>}
            <th className="px-3 py-2">Post</th>
            <th className="px-3 py-2 text-right">Views</th>
            <th className="px-3 py-2 text-right">Earned</th>
            <th className="px-3 py-2 text-right">Paid</th>
            <th className="px-3 py-2 text-right">Unpaid</th>
            <th className="px-3 py-2">Updated</th>
            {renderAction && <th className="px-3 py-2">{actionLabel}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {submissions.map((s) => (
            <tr key={s.id} className="align-middle">
              {showCreator && (
                <td className="px-3 py-2 font-medium text-slate-900">{s.creator?.name ?? '—'}</td>
              )}
              {showCampaign && (
                <td className="px-3 py-2 font-medium text-slate-900">{s.campaign?.name ?? '—'}</td>
              )}
              <td className="max-w-[16rem] px-3 py-2">
                <div className="flex items-center gap-2">
                  <a
                    href={s.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-indigo-600 hover:underline"
                    title={s.postUrl}
                  >
                    {s.postUrl.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                  {s.flagged && <FlagBadge reason={s.flagReason} />}
                </div>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{formatNumber(s.views)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatINR(s.entitledAmount)}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums text-emerald-700">
                {formatINR(s.paidAmount)}
              </td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${s.unpaidAmount > 0 ? 'text-amber-700' : 'text-slate-400'}`}
                title={s.unpaidAmount > 0 ? 'Earned, but the campaign budget ran out' : undefined}
              >
                {formatINR(s.unpaidAmount)}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                {formatDate(s.lastViewsAt)}
              </td>
              {renderAction && <td className="px-3 py-2">{renderAction(s)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
