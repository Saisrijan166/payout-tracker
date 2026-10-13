'use client';

import Link from 'next/link';
import { Suspense, useState, type FormEvent } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { Button, ErrorAlert, Field, inputClass, Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';

const ROLE_OPTIONS: { value: Role; title: string; description: string }[] = [
  { value: 'brand', title: 'Brand', description: 'Run campaigns and track budget' },
  { value: 'creator', title: 'Creator', description: 'Submit posts and earn payouts' },
];

function SignupForm() {
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('creator');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup({ name, email, password, role }); // AuthCard redirects once the session starts
    } catch (err) {
      setError(err);
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="Create an account">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">I am a</legend>
          <div className="grid grid-cols-2 gap-3">
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-md border p-3 text-sm transition-colors ${
                  role === option.value
                    ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                    : 'border-slate-300 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value)}
                  className="sr-only"
                />
                <span className="block font-medium text-slate-900">{option.title}</span>
                <span className="block text-xs text-slate-500">{option.description}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={role === 'brand' ? 'Brand name' : 'Page or channel name'} htmlFor="name">
          <input
            id="name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </Field>
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
        <Field label="Password" htmlFor="password" hint="8 to 72 characters">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <ErrorAlert error={error} />
        <Button type="submit" loading={submitting} className="w-full">
          Sign up
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
          Log in
        </Link>
      </p>
    </AuthCard>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SignupForm />
    </Suspense>
  );
}
