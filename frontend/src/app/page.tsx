'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/format';

/** Sends visitors to their dashboard, or to login. */
export default function HomePage() {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(homeFor(state.user.role));
    if (state.status === 'anonymous') router.replace('/login');
  }, [state, router]);

  return <Loading />;
}
