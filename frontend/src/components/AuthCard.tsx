'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/format';
import { Card } from './ui';

/** Only same-site paths are allowed as a post-login destination (no open redirects). */
function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : null;
}

/** Layout for the login and signup forms; redirects away once the user is signed in. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(next ?? homeFor(state.user.role));
  }, [state, next, router]);

  return (
    <div className="mx-auto max-w-md pt-6">
      <Card className="p-6">
        <h1 className="mb-5 text-xl font-semibold text-slate-900">{title}</h1>
        {children}
      </Card>
    </div>
  );
}
