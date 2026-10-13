'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useSWRConfig } from 'swr';
import { api, ApiError, tokenStore, UNAUTHORIZED_EVENT } from './api';
import type { AuthResponse, Role, User } from './types';

export type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous'; user: null };

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  role: Role;
}

interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<User>;
  signup: (input: SignupInput) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const { mutate } = useSWRConfig();

  const logout = useCallback(() => {
    tokenStore.clear();
    setState({ status: 'anonymous', user: null });
    // Drop cached data so the next user never sees the previous user's dashboard.
    void mutate(() => true, undefined, { revalidate: false });
  }, [mutate]);

  // Restore the session from a stored token.
  useEffect(() => {
    if (!tokenStore.get()) {
      setState({ status: 'anonymous', user: null });
      return;
    }
    api<{ user: User }>('/auth/me')
      .then(({ user }) => setState({ status: 'authenticated', user }))
      .catch((err: unknown) => {
        // An invalid or expired token is cleared; a network error keeps it for the next reload.
        if (err instanceof ApiError && err.status === 401) tokenStore.clear();
        setState({ status: 'anonymous', user: null });
      });
  }, []);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, logout);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, logout);
  }, [logout]);

  const startSession = useCallback(({ token, user }: AuthResponse): User => {
    tokenStore.set(token);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) =>
      startSession(
        await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }),
      ),
    [startSession],
  );

  const signup = useCallback(
    async (input: SignupInput) =>
      startSession(await api<AuthResponse>('/auth/signup', { method: 'POST', body: input })),
    [startSession],
  );

  const value = useMemo(() => ({ state, login, signup, logout }), [state, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
