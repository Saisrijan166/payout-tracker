import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { AppError, isDuplicateKeyError, type ErrorCode } from '../lib/errors';
import { logger } from '../lib/logger';

interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

/** Errors raised by body-parser carry an HTTP status and a `type` such as `entity.parse.failed`. */
function isBodyParserError(err: unknown): err is Error & { status: number; type: string } {
  return (
    err instanceof Error &&
    'status' in err &&
    typeof err.status === 'number' &&
    'type' in err &&
    typeof err.type === 'string'
  );
}

function toResponse(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, details: err.details } },
    };
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return {
      status: 400,
      body: { error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details } },
    };
  }
  if (err instanceof mongoose.Error.CastError) {
    return { status: 400, body: { error: { code: 'INVALID_ID', message: `Invalid ${err.path}` } } };
  }
  if (isDuplicateKeyError(err)) {
    return {
      status: 409,
      body: { error: { code: 'CONFLICT', message: 'Resource already exists' } },
    };
  }
  if (isBodyParserError(err)) {
    if (err.type === 'entity.too.large') {
      return {
        status: 413,
        body: { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } },
      };
    }
    if (err.status === 400) {
      return {
        status: 400,
        body: { error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' } },
      };
    }
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
  };
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const { status, body } = toResponse(err);
  if (status >= 500) {
    logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
    if (env.NODE_ENV !== 'production' && err instanceof Error) {
      body.error.details = { name: err.name, message: err.message };
    }
  }
  res.status(status).json(body);
};

export const notFoundHandler: RequestHandler = (req) => {
  throw new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
};
