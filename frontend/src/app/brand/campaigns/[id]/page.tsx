'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { BudgetBar } from '@/components/BudgetBar';
import { MilestoneLadder, PlatformBadge, StatusBadge } from '@/components/CampaignBadges';
import { SubmissionsTable } from '@/components/SubmissionsTable';
import { Card, EmptyState, ErrorAlert, Loading, PageHeader, SectionHeader } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { Campaign, Submission } from '@/lib/types';

export default function BrandCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, isLoading } = useSWR<{ campaign: Campaign; submissions: Submission[] }>(
    `/campaigns/${id}`,
    { refreshInterval: 15_000 },
  );

  return (
    <div className="space-y-6">
      <Link
        href="/brand"
        className="inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500"
      >
        ← All campaigns
      </Link>
      {isLoading && <Loading label="Loading campaign" />}
      <ErrorAlert error={error} />
      {data && (
        <>
          <div className="space-y-4">
            <PageHeader
              title={data.campaign.name}
              subtitle={`Created ${formatDate(data.campaign.createdAt)}. Budget, payout ladder and every post submitted to this campaign.`}
              actions={
                <>
                  <PlatformBadge platform={data.campaign.platform} />
                  <StatusBadge status={data.campaign.status} />
                </>
              }
            />
            <Card className="grid gap-6 md:grid-cols-2">
              <section aria-labelledby="budget-heading" className="space-y-3">
                <SectionHeader
                  id="budget-heading"
                  as="h3"
                  title="Budget"
                  hint="Paid out so far against the total budget."
                />
                <BudgetBar totalBudget={data.campaign.totalBudget} spent={data.campaign.spent} />
              </section>
              <section aria-labelledby="ladder-heading" className="space-y-3">
                <SectionHeader
                  id="ladder-heading"
                  as="h3"
                  title="Payout ladder"
                  hint="A post earns the payout of the highest milestone it reaches."
                />
                <MilestoneLadder milestones={data.campaign.milestones} />
              </section>
            </Card>
          </div>

          <section aria-labelledby="submissions-heading" className="space-y-3">
            <SectionHeader
              id="submissions-heading"
              title={`Submissions (${data.submissions.length})`}
              hint="Each post's views, earnings and payments. Refreshes every 15 seconds."
            />
            {data.submissions.length === 0 ? (
              <EmptyState title="No posts submitted yet">
                Creators will appear here once they submit posts to this campaign.
              </EmptyState>
            ) : (
              <SubmissionsTable submissions={data.submissions} showCreator />
            )}
          </section>
        </>
      )}
    </div>
  );
}
