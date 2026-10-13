'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError } from './api';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastInput {
  tone: ToastTone;
  title: string;
  description?: string;
  details?: string[];
}

interface Toast extends ToastInput {
  id: number;
}

/** How long a toast stays up. Hovering or focusing it pauses the countdown. */
export const TOAST_DURATION_MS = 4000;
const MAX_VISIBLE = 4;

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((toast: ToastInput) => {
    nextId += 1;
    const id = nextId;
    setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <section
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-16 z-50 flex flex-col items-stretch gap-2 sm:left-auto sm:right-4 sm:w-96"
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

const TONE_STYLES: Record<ToastTone, { ring: string; icon: string; path: string }> = {
  success: {
    ring: 'border-emerald-200',
    icon: 'text-emerald-600',
    path: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
  error: {
    ring: 'border-rose-200',
    icon: 'text-rose-600',
    path: 'M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z',
  },
  info: {
    ring: 'border-indigo-200',
    icon: 'text-indigo-600',
    path: 'm11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z',
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const style = TONE_STYLES[toast.tone];

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [paused, toast.id, onDismiss]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border bg-white p-3 shadow-lg motion-safe:animate-[toast-in_160ms_ease-out] ${style.ring}`}
    >
      <svg
        className={`mt-0.5 h-5 w-5 flex-none ${style.icon}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={style.path} />
      </svg>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-slate-900">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-slate-600">{toast.description}</p>}
        {toast.details && toast.details.length > 0 && (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">
            {toast.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        title="Dismiss"
        aria-label="Dismiss notification"
        className="-m-1 flex-none rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );
}

export interface ToastApi {
  success: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  /** Shows an API (or other) error: its message plus any field-level details. */
  fromError: (err: unknown) => void;
}

export function useToast(): ToastApi {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>');

  return useMemo(
    () => ({
      success: (title, description) => show({ tone: 'success', title, description }),
      info: (title, description) => show({ tone: 'info', title, description }),
      error: (title, description) => show({ tone: 'error', title, description }),
      fromError: (err) => {
        const title = err instanceof Error ? err.message : 'Something went wrong';
        const details =
          err instanceof ApiError ? [...new Set(err.details.map((d) => d.message))] : undefined;
        show({ tone: 'error', title, details });
      },
    }),
    [show],
  );
}
