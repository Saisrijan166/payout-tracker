import { formatINR } from '@/lib/format';

/** Spent vs remaining budget as a labelled progress bar. */
export function BudgetBar({ totalBudget, spent }: { totalBudget: number; spent: number }) {
  const remaining = Math.max(0, totalBudget - spent);
  const percent = totalBudget > 0 ? Math.min(100, Math.round((spent / totalBudget) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div
        role="progressbar"
        aria-label="Budget spent"
        aria-valuemin={0}
        aria-valuemax={totalBudget}
        aria-valuenow={spent}
        className="h-2 overflow-hidden rounded-full bg-slate-100"
      >
        <div
          className={`h-full rounded-full ${percent >= 100 ? 'bg-amber-500' : 'bg-indigo-500'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 text-xs text-slate-600">
        <span>
          <strong className="font-semibold text-slate-900">{formatINR(spent)}</strong> spent (
          {percent}%)
        </span>
        <span>
          <strong className="font-semibold text-slate-900">{formatINR(remaining)}</strong> remaining
          of {formatINR(totalBudget)}
        </span>
      </div>
    </div>
  );
}
