'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { formatINR, formatNumber } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { Submission, ViewUpdateResult } from '@/lib/types';
import { Button, inputClass } from './ui';

/**
 * Demo control that stands in for platform data: sends a new view count to
 * PATCH /api/submissions/:id/views and reports what was paid as a toast.
 * The input stretches and the button sits flush right, so the control fills its column.
 */
export function SimulateViewsForm({
  submission,
  onUpdated,
}: {
  submission: Submission;
  onUpdated: (result: ViewUpdateResult) => void;
}) {
  const toast = useToast();
  const [views, setViews] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const campaignName = submission.campaign?.name ?? 'this campaign';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number(views.trim());
    if (!/^\d+$/.test(views.trim()) || !Number.isSafeInteger(parsed)) {
      setInvalid(true);
      toast.error('Enter a whole number of views', 'For example 60000, without commas or spaces.');
      return;
    }
    setInvalid(false);
    setSubmitting(true);
    try {
      const result = await api<ViewUpdateResult>(`/submissions/${submission.id}/views`, {
        method: 'PATCH',
        body: { views: parsed },
      });
      const { paidNow, unpaid } = result.payout;
      const shortfall =
        unpaid > 0 ? ` ${formatINR(unpaid)} is unpaid because the campaign budget ran out.` : '';
      if (paidNow > 0) {
        toast.success(
          `Paid ${formatINR(paidNow)}`,
          `Views set to ${formatNumber(parsed)} on “${campaignName}”.${shortfall}`,
        );
      } else {
        toast.info(
          `Views set to ${formatNumber(parsed)}`,
          unpaid > 0
            ? `No payout: the campaign budget has run out (${formatINR(unpaid)} unpaid).`
            : 'No new milestone reached, so there is nothing more to pay.',
        );
      }
      setViews('');
      onUpdated(result);
    } catch (err) {
      setInvalid(true);
      toast.fromError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex w-full items-center gap-1.5"
      noValidate
    >
      <input
        aria-label={`New view count for ${submission.postUrl}`}
        inputMode="numeric"
        value={views}
        onChange={(e) => {
          setViews(e.target.value);
          setInvalid(false);
        }}
        placeholder={String(submission.views + 10_000)}
        title="New total view count for this post"
        aria-invalid={invalid || undefined}
        className={`${inputClass} h-8 min-w-0 flex-1 py-0`}
      />
      <Button
        type="submit"
        variant="secondary"
        loading={submitting}
        title="Send this view count, as the platform would"
        className="h-8 flex-none px-3 py-0"
      >
        Set
      </Button>
    </form>
  );
}
