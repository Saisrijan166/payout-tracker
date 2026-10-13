'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/format';
import type { Submission, ViewUpdateResult } from '@/lib/types';
import { Button, inputClass } from './ui';

/**
 * Demo control that stands in for platform data: sends a new view count to
 * PATCH /api/submissions/:id/views and reports what was paid.
 */
export function SimulateViewsForm({
  submission,
  onUpdated,
}: {
  submission: Submission;
  onUpdated: (result: ViewUpdateResult) => void;
}) {
  const [views, setViews] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    const parsed = Number(views.trim());
    if (!/^\d+$/.test(views.trim()) || !Number.isSafeInteger(parsed)) {
      setMessage({ tone: 'error', text: 'Enter a whole number' });
      return;
    }
    setSubmitting(true);
    try {
      const result = await api<ViewUpdateResult>(`/submissions/${submission.id}/views`, {
        method: 'PATCH',
        body: { views: parsed },
      });
      const { paidNow, unpaid } = result.payout;
      let text = paidNow > 0 ? `Paid ${formatINR(paidNow)}` : 'No new payout';
      if (unpaid > 0) text += ` · ${formatINR(unpaid)} unpaid (budget ran out)`;
      setMessage({ tone: 'ok', text });
      setViews('');
      onUpdated(result);
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="min-w-[13rem] space-y-1" noValidate>
      <div className="flex gap-1.5">
        <div className="w-28 flex-none">
          <input
            aria-label={`New view count for ${submission.postUrl}`}
            inputMode="numeric"
            value={views}
            onChange={(e) => setViews(e.target.value)}
            placeholder={String(submission.views + 10_000)}
            className={`${inputClass} py-1.5`}
          />
        </div>
        <Button type="submit" variant="secondary" loading={submitting} className="py-1.5">
          Set
        </Button>
      </div>
      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`text-xs ${message.tone === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
