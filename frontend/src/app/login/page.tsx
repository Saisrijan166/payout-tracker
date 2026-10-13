'use client';

import Link from 'next/link';
import { Suspense, useRef, useState, type FormEvent } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { DemoAccounts } from '@/components/DemoAccounts';
import { Button, Field, inputClass, Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';

function LoginForm() {
  const { login } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(email, password); // AuthCard redirects once the session starts
      toast.success(`Welcome back, ${user.name}`);
    } catch (err) {
      toast.fromError(err);
      setSubmitting(false);
    }
  };

  const fillDemoAccount = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    submitRef.current?.focus();
  };

  return (
    <AuthCard
      title="Log in"
      subtitle="Brands manage campaigns here; creators track their posts and earnings."
      after={<DemoAccounts selectedEmail={email} onSelect={fillDemoAccount} />}
    >
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
        <Button ref={submitRef} type="submit" loading={submitting} className="w-full">
          Log in
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        New here?{' '}
        <Link href="/signup" className="font-medium text-indigo-600 hover:text-indigo-500">
          Create an account
        </Link>
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
