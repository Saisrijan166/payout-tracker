'use client';

import type { ReactNode } from 'react';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import type { Submission } from '@/lib/types';
import { FlagBadge } from './CampaignBadges';
import { Pagination, usePagination } from './Pagination';

interface SubmissionsTableProps {
  submissions: Submission[];
  /** Brand view: show who submitted each post. */
  showCreator?: boolean;
  /** Creator view: show which campaign each post belongs to. */
  showCampaign?: boolean;
  /** Optional extra column, e.g. the "simulate views" control. */
  renderAction?: (submission: Submission) => ReactNode;
  actionLabel?: string;
  actionHint?: string;
}

const UNPAID_HINT = 'Earned, but not paid because the campaign budget ran out';

export function SubmissionsTable({
  submissions,
  showCreator = false,
  showCampaign = false,
  renderAction,
  actionLabel = 'Action',
  actionHint,
}: SubmissionsTableProps) {
  const paging = usePagination(submissions);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide whitespace-nowrap text-slate-500">
            <tr>
              {showCreator && <th className="px-3 py-2">Creator</th>}
              {showCampaign && <th className="px-3 py-2">Campaign</th>}
              <th className="px-3 py-2">Post</th>
              <th className="px-3 py-2 text-right" title="Latest view count reported for the post">
                Views
              </th>
              <th
                className="px-3 py-2 text-right"
                title="Payout of the highest milestone this post has reached"
              >
                Earned
              </th>
              <th className="px-3 py-2 text-right" title="Amount actually paid so far">
                Paid
              </th>
              <th className="px-3 py-2 text-right" title={UNPAID_HINT}>
                Unpaid
              </th>
              <th className="px-3 py-2" title="Date of the latest view count (DD-MM-YYYY)">
                Updated
              </th>
              {renderAction && (
                <th className="w-48 min-w-[12rem] px-3 py-2" title={actionHint}>
                  {actionLabel}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paging.pageItems.map((s) => (
              <tr key={s.id} className="align-middle">
                {showCreator && (
                  <td className="px-3 py-2 font-medium text-slate-900">{s.creator?.name ?? '—'}</td>
                )}
                {showCampaign && (
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {s.campaign?.name ?? '—'}
                  </td>
                )}
                <td className="max-w-[16rem] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <a
                      href={s.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-indigo-600 hover:underline"
                      title={`Open ${s.postUrl}`}
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
                  title={s.unpaidAmount > 0 ? UNPAID_HINT : 'Nothing unpaid'}
                >
                  {formatINR(s.unpaidAmount)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-slate-500">
                  {formatDate(s.lastViewsAt)}
                </td>
                {renderAction && (
                  <td className="w-48 min-w-[12rem] px-3 py-2">{renderAction(s)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination paging={paging} label="posts" className="border-t border-slate-200 px-3 py-2" />
    </div>
  );
}
