import type { Request, RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import type { Role } from '../models/user.model';
import { verifyToken } from '../modules/auth/auth.tokens';
import type { AuthUser } from '../types/express';

const BEARER = /^Bearer\s+(\S+)$/i;

/** Requires a valid `Authorization: Bearer <jwt>` header and sets `req.user`. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = BEARER.exec(req.get('authorization') ?? '')?.[1];
  if (!token) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Missing bearer token');
  }
  req.user = verifyToken(token);
  next();
};

/** Must run after `requireAuth`. Rejects callers whose role is not in `roles` with 403. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const user = getAuthUser(req);
    if (!roles.includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', `This action requires the ${roles.join(' or ')} role`);
    }
    next();
  };
}

/** Returns the authenticated caller, or throws 401 if `requireAuth` did not run. */
export function getAuthUser(req: Request): AuthUser {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  return req.user;
}
