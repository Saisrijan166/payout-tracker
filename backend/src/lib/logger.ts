import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'memed-api' },
  redact: ['req.headers.authorization', 'req.body.password'],
});
