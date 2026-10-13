'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { PLATFORM_LABEL } from '@/lib/format';
import type { Campaign, Submission } from '@/lib/types';
import { Button, ErrorAlert, inputClass } from './ui';

const PLACEHOLDER = {
  instagram: 'https://www.instagram.com/reel/…',
  youtube: 'https://youtu.be/…',
} as const;

export function SubmitPostForm({
  campaign,
  onSubmitted,
}: {
  campaign: Campaign;
  onSubmitted: (submission: Submission) => void;
}) {
  const [postUrl, setPostUrl] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const inputId = `post-url-${campaign.id}`;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setDone(false);
    setSubmitting(true);
    try {
      const { submission } = await api<{ submission: Submission }>('/submissions', {
        method: 'POST',
        body: { campaignId: campaign.id, postUrl },
      });
      setPostUrl('');
      setDone(true);
      onSubmitted(submission);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2" noValidate>
      <label htmlFor={inputId} className="block text-xs font-medium text-slate-600">
        Your {PLATFORM_LABEL[campaign.platform]} post link
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="url"
          value={postUrl}
          onChange={(e) => setPostUrl(e.target.value)}
          placeholder={PLACEHOLDER[campaign.platform]}
          className={inputClass}
        />
        <Button type="submit" loading={submitting} disabled={postUrl.trim() === ''}>
          Submit
        </Button>
      </div>
      {done && (
        <p role="status" className="text-xs text-emerald-700">
          Submitted. It now appears under My submissions.
        </p>
      )}
      <ErrorAlert error={error} />
    </form>
  );
}
