'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { homeFor } from '@/lib/format';
import { Badge, Button } from './ui';

export function Navbar() {
  const { state, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <nav className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link
          href={state.status === 'authenticated' ? homeFor(state.user.role) : '/'}
          className="text-base font-semibold text-slate-900"
        >
          Meme&apos;d <span className="text-indigo-600">Payouts</span>
        </Link>
        {state.status === 'authenticated' && (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-700 sm:inline">{state.user.name}</span>
            <Badge tone={state.user.role === 'brand' ? 'info' : 'success'}>
              {state.user.role === 'brand' ? 'Brand' : 'Creator'}
            </Badge>
            <Button variant="ghost" onClick={handleLogout}>
              Log out
            </Button>
          </div>
        )}
      </div>
    </nav>
  );
}
