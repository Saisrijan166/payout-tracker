'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { BudgetBar } from '@/components/BudgetBar';
import { MilestoneLadder, PlatformBadge, StatusBadge } from '@/components/CampaignBadges';
import { SubmissionsTable } from '@/components/SubmissionsTable';
import { Card, EmptyState, ErrorAlert, Loading } from '@/components/ui';
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
      <Link href="/brand" className="text-sm font-medium text-indigo-600 hover:text-indigo-500">
        ← All campaigns
      </Link>
      {isLoading && <Loading label="Loading campaign" />}
      <ErrorAlert error={error} />
      {data && (
        <>
          <Card className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                  {data.campaign.name}
                </h1>
                <p className="text-sm text-slate-500">
                  Created {formatDate(data.campaign.createdAt)}
                </p>
              </div>
              <div className="flex gap-1.5">
                <PlatformBadge platform={data.campaign.platform} />
                <StatusBadge status={data.campaign.status} />
              </div>
            </div>
            <BudgetBar totalBudget={data.campaign.totalBudget} spent={data.campaign.spent} />
            <MilestoneLadder milestones={data.campaign.milestones} />
          </Card>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              Submissions ({data.submissions.length})
            </h2>
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
