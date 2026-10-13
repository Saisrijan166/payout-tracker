'use client';

import useSWR from 'swr';
import { BudgetBar } from '@/components/BudgetBar';
import { MilestoneLadder, PlatformBadge } from '@/components/CampaignBadges';
import { SimulateViewsForm } from '@/components/SimulateViewsForm';
import { SubmissionsTable } from '@/components/SubmissionsTable';
import { SubmitPostForm } from '@/components/SubmitPostForm';
import { Card, EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/ui';
import { formatINR, formatNumber } from '@/lib/format';
import type { Campaign, CreatorEarnings } from '@/lib/types';

function EarningsSummary({ summary }: { summary: CreatorEarnings['summary'] }) {
  const tiles = [
    { label: 'Total earned', value: formatINR(summary.totalEarned), tone: 'text-emerald-700' },
    {
      label: 'Unpaid (budget ran out)',
      value: formatINR(summary.totalUnpaid),
      tone: summary.totalUnpaid > 0 ? 'text-amber-700' : 'text-slate-900',
    },
    {
      label: 'Posts submitted',
      value: formatNumber(summary.submissionCount),
      tone: 'text-slate-900',
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{tile.label}</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${tile.tone}`}>{tile.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function CreatorDashboardPage() {
  const earnings = useSWR<CreatorEarnings>('/submissions/mine');
  const live = useSWR<{ campaigns: Campaign[] }>('/campaigns');

  const refresh = () => {
    void earnings.mutate();
    void live.mutate();
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Creator dashboard"
        subtitle="Submit posts to live campaigns. You earn the payout of the highest milestone your post reaches."
      />

      <section aria-labelledby="earnings-heading" className="space-y-3">
        <h2 id="earnings-heading" className="sr-only">
          Earnings
        </h2>
        {earnings.isLoading && <Loading label="Loading earnings" />}
        <ErrorAlert error={earnings.error} />
        {earnings.data && <EarningsSummary summary={earnings.data.summary} />}
      </section>

      <section aria-labelledby="campaigns-heading" className="space-y-3">
        <h2 id="campaigns-heading" className="text-base font-semibold text-slate-900">
          Live campaigns
        </h2>
        {live.isLoading && <Loading label="Loading campaigns" />}
        <ErrorAlert error={live.error} />
        {live.data && live.data.campaigns.length === 0 && (
          <EmptyState title="No live campaigns right now">Check back soon.</EmptyState>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {live.data?.campaigns.map((campaign) => (
            <Card key={campaign.id} className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-900">{campaign.name}</h3>
                <PlatformBadge platform={campaign.platform} />
              </div>
              <MilestoneLadder milestones={campaign.milestones} />
              <BudgetBar totalBudget={campaign.totalBudget} spent={campaign.spent} />
              <SubmitPostForm campaign={campaign} onSubmitted={refresh} />
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="submissions-heading" className="space-y-3">
        <h2 id="submissions-heading" className="text-base font-semibold text-slate-900">
          My submissions
        </h2>
        <p className="text-xs text-slate-500">
          View counts would normally come from Instagram or YouTube. Use <em>Simulate views</em> to
          send a new count and see the payout.
        </p>
        {earnings.data && earnings.data.submissions.length === 0 && (
          <EmptyState title="No submissions yet">
            Submit a post to a live campaign above.
          </EmptyState>
        )}
        {earnings.data && earnings.data.submissions.length > 0 && (
          <SubmissionsTable
            submissions={earnings.data.submissions}
            showCampaign
            actionLabel="Simulate views"
            renderAction={(submission) => (
              <SimulateViewsForm submission={submission} onUpdated={refresh} />
            )}
          />
        )}
      </section>
    </div>
  );
}
