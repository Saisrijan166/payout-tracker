import type { ReactNode } from 'react';
import { RequireRole } from '@/components/RequireRole';

export default function BrandLayout({ children }: { children: ReactNode }) {
  return <RequireRole role="brand">{children}</RequireRole>;
}
