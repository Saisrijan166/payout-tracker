'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { formatINR } from '@/lib/format';
import { useToast } from '@/lib/toast';
import type { Campaign, Platform } from '@/lib/types';
import {
  MAX_MILESTONES,
  validateCampaignDraft,
  type CampaignFieldErrors,
  type MilestoneDraft,
} from '@/lib/validation';
import { Button, Card, Field, fieldErrorId, inputClass, SectionHeader } from './ui';

interface Row extends MilestoneDraft {
  id: number;
}

let nextRowId = 0;
const row = (views = '', payout = ''): Row => ({ id: nextRowId++, views, payout });
const initialRows = (): Row[] => [row('10000', '500'), row('50000', '2000'), row('100000', '5000')];
const noErrors = (): CampaignFieldErrors => ({ rows: {} });

/** Create-campaign form with an editable milestone ladder. */
export function CampaignForm({ onCreated }: { onCreated: (campaign: Campaign) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [totalBudget, setTotalBudget] = useState('');
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [errors, setErrors] = useState<CampaignFieldErrors>(noErrors);
  const [submitting, setSubmitting] = useState(false);

  const clearError = (field: 'name' | 'totalBudget') =>
    setErrors((current) => ({ ...current, [field]: undefined }));

  const updateRow = (index: number, id: number, field: keyof MilestoneDraft, value: string) => {
    setRows((current) => current.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setErrors((current) => {
      const rowErrors = { ...current.rows[index] };
      delete rowErrors[field];
      return { ...current, rows: { ...current.rows, [index]: rowErrors } };
    });
  };

  const removeRow = (id: number) => {
    setRows((current) => current.filter((x) => x.id !== id));
    setErrors(noErrors()); // row indexes shift, so stale row messages would point at the wrong row
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateCampaignDraft({ name, totalBudget, milestones: rows });
    setErrors(result.errors);
    if (!result.valid || result.totalBudget === null) return;

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
      toast.success(
        `Campaign “${campaign.name}” created`,
        'It is live, and creators can submit posts to it now.',
      );
      onCreated(campaign);
    } catch (err) {
      toast.fromError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const budgetPreview = Number(totalBudget);

  return (
    <Card>
      <div className="mb-4">
        <SectionHeader
          title="New campaign"
          hint="Set a budget and a payout ladder. Creators can submit posts once it is saved."
        />
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <Field label="Campaign name" htmlFor="campaign-name" error={errors.name}>
          <input
            id="campaign-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clearError('name');
            }}
            placeholder="Diwali Snack Drop"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? fieldErrorId('campaign-name') : undefined}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Platform" htmlFor="campaign-platform">
            <select
              id="campaign-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value === 'youtube' ? 'youtube' : 'instagram')}
              title="Creators can only submit posts from this platform"
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
            error={errors.totalBudget}
          >
            <input
              id="campaign-budget"
              inputMode="numeric"
              value={totalBudget}
              onChange={(e) => {
                setTotalBudget(e.target.value);
                clearError('totalBudget');
              }}
              placeholder="50000"
              title="The most this campaign will ever pay out in total"
              aria-invalid={errors.totalBudget ? true : undefined}
              aria-describedby={errors.totalBudget ? fieldErrorId('campaign-budget') : undefined}
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
            <span title="View count a post must reach">Views</span>
            <span title="Total paid to a post that reaches these views">Payout (₹)</span>
            <span className="w-9" aria-hidden="true" />
          </div>
          {rows.map((r, index) => {
            const rowErrors = errors.rows[index];
            const viewsId = `milestone-${r.id}-views`;
            const payoutId = `milestone-${r.id}-payout`;
            return (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_auto] gap-x-2 gap-y-1">
                <input
                  id={viewsId}
                  aria-label={`Milestone ${index + 1} views`}
                  inputMode="numeric"
                  value={r.views}
                  onChange={(e) => updateRow(index, r.id, 'views', e.target.value)}
                  aria-invalid={rowErrors?.views ? true : undefined}
                  aria-describedby={rowErrors?.views ? fieldErrorId(viewsId) : undefined}
                  className={inputClass}
                />
                <input
                  id={payoutId}
                  aria-label={`Milestone ${index + 1} payout`}
                  inputMode="numeric"
                  value={r.payout}
                  onChange={(e) => updateRow(index, r.id, 'payout', e.target.value)}
                  aria-invalid={rowErrors?.payout ? true : undefined}
                  aria-describedby={rowErrors?.payout ? fieldErrorId(payoutId) : undefined}
                  className={inputClass}
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="w-9 px-0"
                  aria-label={`Remove milestone ${index + 1}`}
                  title={
                    rows.length === 1
                      ? 'A campaign needs at least one milestone'
                      : 'Remove this milestone'
                  }
                  onClick={() => removeRow(r.id)}
                  disabled={rows.length === 1}
                >
                  ✕
                </Button>
                {(rowErrors?.views || rowErrors?.payout) && (
                  <>
                    <p id={fieldErrorId(viewsId)} className="text-xs text-rose-600">
                      {rowErrors.views}
                    </p>
                    <p id={fieldErrorId(payoutId)} className="text-xs text-rose-600">
                      {rowErrors.payout}
                    </p>
                    <span aria-hidden="true" />
                  </>
                )}
              </div>
            );
          })}
          {errors.ladder && <p className="text-xs text-rose-600">{errors.ladder}</p>}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRows((current) => [...current, row()])}
            disabled={rows.length >= MAX_MILESTONES}
            title={`Up to ${MAX_MILESTONES} milestones per campaign`}
          >
            + Add milestone
          </Button>
        </fieldset>

        <Button type="submit" loading={submitting} className="w-full">
          Create campaign
        </Button>
      </form>
    </Card>
  );
}
