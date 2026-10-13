import { Router } from 'express';
import { isDbConnected } from './lib/db';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  const db = isDbConnected() ? 'up' : 'down';
  res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', db });
});
