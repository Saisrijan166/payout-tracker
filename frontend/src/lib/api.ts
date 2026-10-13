import type { ApiErrorDetail } from './types';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api').replace(
  /\/+$/,
  '',
);

/** Fired when an authenticated request gets a 401, so the auth provider can log out. */
export const UNAUTHORIZED_EVENT = 'memed:unauthorized';

const TOKEN_KEY = 'memed.token';

// localStorage can throw (private mode, blocked storage); treat that as "no token".
export const tokenStore = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // The session still works until the page reloads.
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing to clear.
    }
  },
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toApiError(body: unknown, status: number): ApiError {
  const error = isRecord(body) && isRecord(body.error) ? body.error : null;
  const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN_ERROR';
  const message =
    typeof error?.message === 'string' ? error.message : `Request failed (HTTP ${status})`;
  const details = Array.isArray(error?.details)
    ? error.details.filter(
        (d): d is ApiErrorDetail =>
          isRecord(d) && typeof d.path === 'string' && typeof d.message === 'string',
      )
    : [];
  return new ApiError(status, code, message, details);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
}

/** Calls the API, attaching the bearer token, and throws ApiError for non-2xx responses. */
export async function api<T>(
  path: string,
  { method = 'GET', body }: RequestOptions = {},
): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach the server. It may still be waking up, so try again in a moment.',
    );
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw toApiError(data, response.status);
  }
  return data as T;
}

/** SWR fetcher: the key is the API path. */
export const fetcher = <T>(path: string): Promise<T> => api<T>(path);
