'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { BudgetBar } from '@/components/BudgetBar';
import { MilestoneLadder, PlatformBadge, StatusBadge } from '@/components/CampaignBadges';
import { CampaignForm } from '@/components/CampaignForm';
import { Badge, Card, EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { formatDate, formatINR } from '@/lib/format';
import type { BrandCampaign } from '@/lib/types';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: BrandCampaign }) {
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
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
              · <Badge tone="danger">{campaign.flaggedCount} flagged</Badge>
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
    </Card>
  );
}

export default function BrandDashboardPage() {
  const { data, error, isLoading, mutate } = useSWR<{ campaigns: BrandCampaign[] }>(
    '/campaigns/mine',
  );
  const campaigns = data?.campaigns ?? [];
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <CampaignForm onCreated={() => void mutate()} />
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Total budget" value={formatINR(totals.budget)} />
            <Stat label="Spent" value={formatINR(totals.spent)} />
            <Stat label="Remaining" value={formatINR(totals.budget - totals.spent)} />
          </div>
          {isLoading && <Loading label="Loading campaigns" />}
          <ErrorAlert error={error} />
          {data && campaigns.length === 0 && (
            <EmptyState title="No campaigns yet">
              Create your first campaign with the form.
            </EmptyState>
          )}
          {campaigns.map((campaign) => (
            <CampaignRow key={campaign.id} campaign={campaign} />
          ))}
        </div>
      </div>
    </>
  );
}
