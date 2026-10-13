import { Router } from 'express';
import { isDbConnected } from './lib/db';
import { authRouter } from './modules/auth/auth.routes';
import { campaignsRouter } from './modules/campaigns/campaigns.routes';
import { submissionsRouter } from './modules/submissions/submissions.routes';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  const db = isDbConnected() ? 'up' : 'down';
  res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', db });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/campaigns', campaignsRouter);
apiRouter.use('/submissions', submissionsRouter);
