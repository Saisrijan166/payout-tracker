'use client';

import Link from 'next/link';
import { useRef } from 'react';
import useSWR from 'swr';
import { BudgetBar } from '@/components/BudgetBar';
import { MilestoneLadder, PlatformBadge, StatusBadge } from '@/components/CampaignBadges';
import { CampaignForm } from '@/components/CampaignForm';
import { Pagination, usePagination } from '@/components/Pagination';
import { Badge, EmptyState, ErrorAlert, Loading, PageHeader, SectionHeader } from '@/components/ui';
import { formatDate, formatINR, formatNumber } from '@/lib/format';
import type { BrandCampaign } from '@/lib/types';

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div title={hint} className="rounded-lg border border-slate-200 bg-white px-3 py-3 sm:px-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">
        {label}
      </p>
      <p className="mt-1 truncate text-base font-semibold tabular-nums text-slate-900 sm:text-xl">
        {value}
      </p>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: BrandCampaign }) {
  return (
    <article className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900">{campaign.name}</h3>
          <p className="text-xs text-slate-500">Created {formatDate(campaign.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <PlatformBadge platform={campaign.platform} />
          <StatusBadge status={campaign.status} />
        </div>
      </div>
      <BudgetBar totalBudget={campaign.totalBudget} spent={campaign.spent} />
      <MilestoneLadder milestones={campaign.milestones} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
        <span className="text-slate-600">
          {campaign.submissionCount} {campaign.submissionCount === 1 ? 'post' : 'posts'}
          {campaign.flaggedCount > 0 && (
            <>
              {' '}
              ·{' '}
              <Badge
                tone="danger"
                title="Posts whose views jumped unusually fast. Open the campaign to see why."
              >
                {campaign.flaggedCount} flagged
              </Badge>
            </>
          )}
        </span>
        <Link
          href={`/brand/campaigns/${campaign.id}`}
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          View submissions →
        </Link>
      </div>
    </article>
  );
}

export default function BrandDashboardPage() {
  const { data, error, isLoading, mutate } = useSWR<{ campaigns: BrandCampaign[] }>(
    '/campaigns/mine',
  );
  const campaigns = data?.campaigns ?? [];
  const paging = usePagination(campaigns);
  const listRef = useRef<HTMLDivElement>(null);
  const totals = campaigns.reduce(
    (acc, c) => ({ budget: acc.budget + c.totalBudget, spent: acc.spent + c.spent }),
    { budget: 0, spent: 0 },
  );

  return (
    <>
      <PageHeader
        title="Your campaigns"
        subtitle="Create campaigns and watch budget spent against what remains."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <CampaignForm onCreated={() => void mutate()} />

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="overview-heading" className="space-y-3">
            <SectionHeader
              id="overview-heading"
              title="Budget overview"
              hint="Totals across all your campaigns."
            />
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <Stat
                label="Total budget"
                value={formatINR(totals.budget)}
                hint="Sum of the budgets of all your campaigns"
              />
              <Stat
                label="Spent"
                value={formatINR(totals.spent)}
                hint="Paid out to creators so far"
              />
              <Stat
                label="Remaining"
                value={formatINR(totals.budget - totals.spent)}
                hint="Budget not yet paid out"
              />
            </div>
          </section>

          {/* Fixed-height panel: the header and pager stay put, only the list scrolls. */}
          <section
            aria-labelledby="campaigns-heading"
            className="flex h-[clamp(26rem,70vh,44rem)] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-sm"
          >
            <header className="flex-none border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
              <SectionHeader
                id="campaigns-heading"
                title="Campaigns"
                hint="Budget spent vs remaining for each campaign. Open one to see its posts."
                actions={
                  data && (
                    <Badge tone="neutral" title="Number of campaigns you have created">
                      {formatNumber(campaigns.length)}
                    </Badge>
                  )
                }
              />
            </header>
            <div
              ref={listRef}
              tabIndex={0}
              aria-label="Campaign list"
              className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/40 sm:p-4"
            >
              {isLoading && <Loading label="Loading campaigns" />}
              <ErrorAlert error={error} />
              {data && campaigns.length === 0 && (
                <EmptyState title="No campaigns yet">
                  Create your first campaign with the form.
                </EmptyState>
              )}
              {paging.pageItems.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} />
              ))}
            </div>
            <Pagination
              paging={paging}
              label="campaigns"
              onPageChange={() => listRef.current?.scrollTo({ top: 0 })}
              className="flex-none border-t border-slate-200 bg-white px-3 py-2"
            />
          </section>
        </div>
      </div>
    </>
  );
}
