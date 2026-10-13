'use client';

import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { fetcher } from '@/lib/api';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: true, shouldRetryOnError: false }}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </SWRConfig>
  );
}
