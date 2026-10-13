'use client';

import type { ReactNode } from 'react';
import type { Role } from '@/lib/types';
import { Badge, Card, SectionHeader } from './ui';

export const DEMO_PASSWORD = 'Password123!';

const ACCOUNTS: { role: Role; name: string; email: string }[] = [
  { role: 'brand', name: 'Acme Snacks', email: 'brand@memed.test' },
  { role: 'creator', name: 'Desi Meme Lord', email: 'creator@memed.test' },
  { role: 'creator', name: 'Clip Central', email: 'creator2@memed.test' },
];

function Labelled({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </span>
  );
}

/** Seeded demo logins; clicking a row fills in the login form (it does not submit it). */
export function DemoAccounts({
  selectedEmail,
  onSelect,
}: {
  selectedEmail: string;
  onSelect: (email: string, password: string) => void;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <SectionHeader
          title="Demo accounts"
          hint="Available when the demo data is seeded. Click one to fill in the form."
        />
      </div>
      <ul className="space-y-1.5">
        {ACCOUNTS.map((account) => {
          const selected = selectedEmail.trim().toLowerCase() === account.email;
          return (
            <li key={account.email}>
              <button
                type="button"
                onClick={() => onSelect(account.email, DEMO_PASSWORD)}
                aria-pressed={selected}
                aria-label={`Fill in the ${account.role} demo account, ${account.email}`}
                title={`Fill in the login form as ${account.name} (${account.role})`}
                className={`grid w-full grid-cols-2 items-start gap-x-4 gap-y-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] ${
                  selected
                    ? 'border-indigo-300 bg-indigo-50'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Labelled label="Role">
                  <span>
                    <Badge tone={account.role === 'brand' ? 'info' : 'success'}>
                      {account.role === 'brand' ? 'Brand' : 'Creator'}
                    </Badge>
                  </span>
                </Labelled>
                <Labelled
                  label="Email"
                  className="order-last col-span-2 sm:order-none sm:col-span-1"
                >
                  <span className="truncate font-mono text-[13px] text-slate-900">
                    {account.email}
                  </span>
                </Labelled>
                <Labelled label="Password">
                  <span className="font-mono text-[13px] text-slate-900">{DEMO_PASSWORD}</span>
                </Labelled>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
