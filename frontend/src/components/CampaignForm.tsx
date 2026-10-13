'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/format';
import type { Campaign, Platform } from '@/lib/types';
import { MAX_MILESTONES, validateCampaignDraft, type MilestoneDraft } from '@/lib/validation';
import { Button, Card, ErrorAlert, Field, inputClass } from './ui';

interface Row extends MilestoneDraft {
  id: number;
}

let nextRowId = 0;
const row = (views = '', payout = ''): Row => ({ id: nextRowId++, views, payout });
const initialRows = (): Row[] => [row('10000', '500'), row('50000', '2000'), row('100000', '5000')];

/** Create-campaign form with an editable milestone ladder. */
export function CampaignForm({ onCreated }: { onCreated: (campaign: Campaign) => void }) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [totalBudget, setTotalBudget] = useState('');
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateRow = (id: number, field: keyof MilestoneDraft, value: string) =>
    setRows((current) => current.map((r) => (r.id === id ? { ...r, [field]: value } : r)));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const result = validateCampaignDraft({ name, totalBudget, milestones: rows });
    setIssues(result.issues);
    if (result.issues.length > 0 || result.totalBudget === null) return;

    setSubmitting(true);
    try {
      const { campaign } = await api<{ campaign: Campaign }>('/campaigns', {
        method: 'POST',
        body: {
          name: name.trim(),
          platform,
          totalBudget: result.totalBudget,
          milestones: result.milestones,
        },
      });
      setName('');
      setTotalBudget('');
      setRows(initialRows());
      onCreated(campaign);
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const budgetPreview = Number(totalBudget);

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">New campaign</h2>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <Field label="Campaign name" htmlFor="campaign-name">
          <input
            id="campaign-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Diwali Snack Drop"
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Platform" htmlFor="campaign-platform">
            <select
              id="campaign-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value === 'youtube' ? 'youtube' : 'instagram')}
              className={inputClass}
            >
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
            </select>
          </Field>
          <Field
            label="Total budget (₹)"
            htmlFor="campaign-budget"
            hint={budgetPreview > 0 ? formatINR(budgetPreview) : 'Whole rupees'}
          >
            <input
              id="campaign-budget"
              inputMode="numeric"
              value={totalBudget}
              onChange={(e) => setTotalBudget(e.target.value)}
              placeholder="50000"
              className={inputClass}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Milestone ladder</legend>
          <p className="text-xs text-slate-500">
            A post earns the payout of the highest milestone it reaches (not the sum).
          </p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-slate-500">
            <span>Views</span>
            <span>Payout (₹)</span>
            <span className="sr-only">Remove</span>
          </div>
          {rows.map((r, index) => (
            <div key={r.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                aria-label={`Milestone ${index + 1} views`}
                inputMode="numeric"
                value={r.views}
                onChange={(e) => updateRow(r.id, 'views', e.target.value)}
                className={inputClass}
              />
              <input
                aria-label={`Milestone ${index + 1} payout`}
                inputMode="numeric"
                value={r.payout}
                onChange={(e) => updateRow(r.id, 'payout', e.target.value)}
                className={inputClass}
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove milestone ${index + 1}`}
                onClick={() => setRows((current) => current.filter((x) => x.id !== r.id))}
                disabled={rows.length === 1}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRows((current) => [...current, row()])}
            disabled={rows.length >= MAX_MILESTONES}
          >
            + Add milestone
          </Button>
        </fieldset>

        {issues.length > 0 && (
          <ul
            role="alert"
            className="list-disc space-y-0.5 rounded-md bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900"
          >
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        <ErrorAlert error={error} />
        <Button type="submit" loading={submitting} className="w-full">
          Create campaign
        </Button>
      </form>
    </Card>
  );
}
