'use client';

import { useEffect, useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';

export const inputClass =
  'block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ' +
  'placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 ' +
  'disabled:bg-slate-100 aria-[invalid=true]:border-rose-400';

const BUTTON_VARIANTS = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-300',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
} as const;

// React 19 passes `ref` as a normal prop, so it reaches the <button> through ...props.
interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: keyof typeof BUTTON_VARIANTS;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

/** Id of the error message under a field, for the input's aria-describedby. */
export const fieldErrorId = (htmlFor: string): string => `${htmlFor}-error`;

/**
 * Label + control + hint. `error` replaces the hint with a message that points at
 * this field; the control should set aria-invalid and aria-describedby={fieldErrorId(id)}.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={fieldErrorId(htmlFor)} className="text-xs text-rose-600">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  warning: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  danger: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  info: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
} as const;

export function Badge({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-transparent ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Shows an API error's message and any field-level details. */
export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : 'Something went wrong';
  const details = error instanceof ApiError ? error.details : [];
  return (
    <div
      role="alert"
      className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
    >
      <p className="font-medium">{message}</p>
      {details.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {details.map((d, i) => (
            <li key={`${d.path}-${i}`}>{d.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

/** Loading state that explains the delay if the (free-tier) API is cold-starting. */
export function Loading({ label = 'Loading' }: { label?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="status" className="flex flex-col items-center gap-2 py-10 text-sm text-slate-500">
      <Spinner />
      <span>{label}…</span>
      {slow && (
        <span className="max-w-sm text-center text-xs">
          The server is waking up (free hosting sleeps when idle). This can take up to a minute.
        </span>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  /** Shown to the right of the title, e.g. status badges. */
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-1.5">{actions}</div>}
    </header>
  );
}

/** A section heading with a one-line hint underneath. */
export function SectionHeader({
  id,
  title,
  hint,
  actions,
  as: Heading = 'h2',
}: {
  id?: string;
  title: string;
  hint?: string;
  actions?: ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <Heading id={id} className="text-base font-semibold text-slate-900">
          {title}
        </Heading>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
      {actions && <div className="flex-none">{actions}</div>}
    </div>
  );
}
