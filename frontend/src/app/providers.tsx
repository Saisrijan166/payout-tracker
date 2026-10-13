'use client';

import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { fetcher } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: true, shouldRetryOnError: false }}>
      <AuthProvider>{children}</AuthProvider>
    </SWRConfig>
  );
}
