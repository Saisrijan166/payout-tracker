'use client';

import { useState } from 'react';
import { formatNumber } from '@/lib/format';
import { Button } from './ui';

export const PAGE_SIZE = 10;

/**
 * Client-side paging over a list the API returns in full. The current page is
 * clamped, so it stays valid when the list shrinks after a refresh.
 */
export function usePagination<T>(items: readonly T[], pageSize = PAGE_SIZE) {
  const [requestedPage, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  return {
    page,
    pageCount,
    setPage,
    pageItems: items.slice(start, start + pageSize),
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, items.length),
    total: items.length,
  };
}

export type PaginationState = ReturnType<typeof usePagination>;

interface PaginationProps {
  paging: PaginationState;
  /** What is being paged, for screen readers and the range text, e.g. "campaigns". */
  label: string;
  /** Called after the page changes, e.g. to scroll a list back to its top. */
  onPageChange?: (page: number) => void;
  className?: string;
}

/** Prev / "Page X of Y" / Next. Renders nothing when everything fits on one page. */
export function Pagination({ paging, label, onPageChange, className = '' }: PaginationProps) {
  const { page, pageCount, from, to, total } = paging;
  const goTo = (next: number) => {
    paging.setPage(next);
    onPageChange?.(next);
  };
  if (pageCount <= 1) return null;
  return (
    <nav
      aria-label={`${label} pages`}
      className={`flex items-center justify-between gap-3 text-sm ${className}`}
    >
      <Button
        variant="secondary"
        className="px-3 py-1.5"
        onClick={() => goTo(page - 1)}
        disabled={page <= 1}
        title="Previous page"
      >
        ← Prev
      </Button>
      <p className="text-center text-slate-600" aria-live="polite">
        <span className="font-medium text-slate-900">
          Page {page} of {pageCount}
        </span>
        <span className="hidden text-xs text-slate-500 sm:inline">
          {' '}
          · {formatNumber(from)}–{formatNumber(to)} of {formatNumber(total)} {label}
        </span>
      </p>
      <Button
        variant="secondary"
        className="px-3 py-1.5"
        onClick={() => goTo(page + 1)}
        disabled={page >= pageCount}
        title="Next page"
      >
        Next →
      </Button>
    </nav>
  );
}
