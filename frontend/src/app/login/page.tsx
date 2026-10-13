'use client';

import Link from 'next/link';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { Button, ErrorAlert, Field, inputClass, Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';

function LoginForm() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password); // AuthCard redirects once the session starts
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Log in">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <ErrorAlert error={error} />
        <Button type="submit" loading={submitting} className="w-full">
          Log in
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        New here?{' '}
        <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
          Create an account
        </Link>
      </p>
      <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Demo accounts (when seeded): <code>brand@memed.test</code> or{' '}
        <code>creator@memed.test</code>, password <code>Password123!</code>
      </p>
    </AuthCard>
  );
}

export default function LoginPage() {
  // useSearchParams (for ?next=) needs a Suspense boundary.
  return (
    <Suspense fallback={<Loading />}>
      <LoginForm />
    </Suspense>
  );
}
