import { rateLimit, type Options } from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

const shared: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Tests fire many requests from one IP on purpose.
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, _res, next) => {
    next(new AppError(429, 'RATE_LIMITED', 'Too many requests, please slow down'));
  },
};

/** Signup and login: slows down credential stuffing. */
export const authLimiter = rateLimit({ ...shared, windowMs: 15 * 60 * 1000, limit: 50 });

/** View-count updates are unauthenticated (they simulate platform data), so cap them per IP. */
export const viewsLimiter = rateLimit({ ...shared, windowMs: 60 * 1000, limit: 120 });
