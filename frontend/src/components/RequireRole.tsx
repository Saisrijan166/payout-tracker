'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/format';
import type { Role } from '@/lib/types';
import { Loading } from './ui';

/**
 * Client-side route guard: sends anonymous visitors to /login and users with the
 * wrong role to their own dashboard. This is for navigation only; the API
 * enforces every role check on its own.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { state } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (state.status === 'anonymous') {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (state.status === 'authenticated' && state.user.role !== role) {
      router.replace(homeFor(state.user.role));
    }
  }, [state, role, router, pathname]);

  if (state.status !== 'authenticated' || state.user.role !== role) {
    return <Loading label="Checking your session" />;
  }
  return <>{children}</>;
}
