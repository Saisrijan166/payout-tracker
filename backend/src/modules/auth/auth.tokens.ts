import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { ROLES } from '../../models/user.model';
import type { AuthUser } from '../../types/express';

const TokenPayloadSchema = z.object({
  sub: z.string().regex(/^[a-f\d]{24}$/i),
  role: z.enum(ROLES),
});

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN,
    algorithm: 'HS256',
  });
}

/** Verifies signature, algorithm, expiry and payload shape; any failure is a 401. */
export function verifyToken(token: string): AuthUser {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    const message =
      err instanceof jwt.TokenExpiredError
        ? 'Session expired, please log in again'
        : 'Invalid authentication token';
    throw new AppError(401, 'UNAUTHENTICATED', message);
  }

  const payload = TokenPayloadSchema.safeParse(decoded);
  if (!payload.success) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid authentication token');
  }
  return { id: payload.data.sub, role: payload.data.role };
}
