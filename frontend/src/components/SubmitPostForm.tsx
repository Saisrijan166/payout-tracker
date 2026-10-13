'use client';

import { useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { PLATFORM_LABEL } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { Campaign, Submission } from '@/lib/types';
import { Button, inputClass } from './ui';

const PLACEHOLDER = {
  instagram: 'https://www.instagram.com/reel/…',
  youtube: 'https://youtu.be/…',
} as const;

/** API errors caused by the link itself: the input is outlined so it is clear what to fix. */
const LINK_ERRORS = new Set(['INVALID_POST_URL', 'PLATFORM_MISMATCH', 'DUPLICATE_SUBMISSION']);

export function SubmitPostForm({
  campaign,
  onSubmitted,
}: {
  campaign: Campaign;
  onSubmitted: (submission: Submission) => void;
}) {
  const toast = useToast();
  const [postUrl, setPostUrl] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputId = `post-url-${campaign.id}`;
  const platform = PLATFORM_LABEL[campaign.platform];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInvalid(false);
    setSubmitting(true);
    try {
      const { submission } = await api<{ submission: Submission }>('/submissions', {
        method: 'POST',
        body: { campaignId: campaign.id, postUrl },
      });
      setPostUrl('');
      toast.success(
        'Post submitted',
        `Added to “${campaign.name}”. Track it under My submissions.`,
      );
      onSubmitted(submission);
    } catch (err) {
      setInvalid(err instanceof ApiError && LINK_ERRORS.has(err.code));
      toast.fromError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-1.5" noValidate>
      <label htmlFor={inputId} className="block text-xs font-medium text-slate-600">
        Your {platform} post link
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          type="url"
          value={postUrl}
          onChange={(e) => {
            setPostUrl(e.target.value);
            setInvalid(false);
          }}
          placeholder={PLACEHOLDER[campaign.platform]}
          title={`Link to a single ${platform} ${campaign.platform === 'youtube' ? 'video' : 'post or reel'}`}
          aria-invalid={invalid || undefined}
          className={`${inputClass} min-w-0`}
        />
        <Button
          type="submit"
          loading={submitting}
          disabled={postUrl.trim() === ''}
          title={
            postUrl.trim() === '' ? 'Paste a post link first' : 'Submit this post to the campaign'
          }
          className="flex-none"
        >
          Submit
        </Button>
      </div>
    </form>
  );
}
