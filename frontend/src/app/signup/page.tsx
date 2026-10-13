'use client';

import Link from 'next/link';
import { Suspense, useRef, useState, type FormEvent } from 'react';
import { AuthCard } from '@/components/AuthCard';
import { Button, Field, inputClass, Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { PASSWORD_RULES, unmetPasswordRules } from '@/lib/password';
import { useToast } from '@/lib/toast';
import type { Role } from '@/lib/types';

const ROLE_OPTIONS: { value: Role; title: string; description: string }[] = [
  { value: 'brand', title: 'Brand', description: 'Run campaigns and track budget' },
  { value: 'creator', title: 'Creator', description: 'Submit posts and earn payouts' },
];

function SignupForm() {
  const { signup } = useAuth();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('creator');
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const unmet = unmetPasswordRules(password);
    if (unmet.length > 0) {
      toast.error('Password is not strong enough', `Still needed: ${unmet.join(', ').toLowerCase()}`);
      passwordRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const user = await signup({ name, email, password, role }); // AuthCard redirects once the session starts
      toast.success(`Welcome, ${user.name}`, 'Your account is ready.');
    } catch (err) {
      toast.fromError(err);
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create an account"
      subtitle="Brands run campaigns with a payout ladder; creators earn when their posts hit milestones."
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-slate-700">I am a</legend>
          <p className="-mt-1 mb-2 text-xs text-slate-500">You cannot change this later.</p>
          <div className="grid grid-cols-2 gap-3">
            {ROLE_OPTIONS.map((option) => (
              <label
                key={option.value}
                title={option.description}
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
        <Field label="Password" htmlFor="password">
          <input
            id="password"
            ref={passwordRef}
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            aria-describedby="password-rules"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          {/* Live checklist: inline because it describes this field as you type. */}
          <ul id="password-rules" className="grid gap-x-4 gap-y-1 pt-0.5 text-xs sm:grid-cols-2">
            {PASSWORD_RULES.map((rule) => {
              const met = password.length > 0 && rule.test(password);
              return (
                <li
                  key={rule.label}
                  className={`flex items-center gap-1.5 ${met ? 'text-emerald-600' : 'text-slate-500'}`}
                >
                  <span aria-hidden="true">{met ? '✓' : '○'}</span>
                  {rule.label}
                  <span className="sr-only">{met ? '(met)' : '(not met yet)'}</span>
                </li>
              );
            })}
          </ul>
        </Field>
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
