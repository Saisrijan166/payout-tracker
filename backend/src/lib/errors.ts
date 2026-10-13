import mongoose from 'mongoose';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_ID'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

/**
 * An error that maps directly to an HTTP response.
 * The central error handler turns it into `{ error: { code, message, details } }`.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof mongoose.mongo.MongoServerError && err.code === 11000;
}

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** Validates a path parameter as a MongoDB ObjectId, or throws 400 INVALID_ID. */
export function parseObjectId(value: string | undefined, label = 'id'): string {
  if (!value || !OBJECT_ID.test(value)) {
    throw new AppError(400, 'INVALID_ID', `Invalid ${label}`);
  }
  return value;
}
