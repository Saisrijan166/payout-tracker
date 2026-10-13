import type { ReactNode } from 'react';
import { RequireRole } from '@/components/RequireRole';

export default function CreatorLayout({ children }: { children: ReactNode }) {
  return <RequireRole role="creator">{children}</RequireRole>;
}
