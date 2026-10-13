import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import { viewsLimiter } from '../../middleware/rate-limit';
import {
  createSubmissionHandler,
  listMySubmissionsHandler,
  updateViewsHandler,
} from './submissions.controller';

export const submissionsRouter = Router();

submissionsRouter.post('/', requireAuth, requireRole('creator'), createSubmissionHandler);
submissionsRouter.get('/mine', requireAuth, requireRole('creator'), listMySubmissionsHandler);

// Simulates platform view data, so it has no auth or role check (per the brief); rate-limited instead.
submissionsRouter.patch('/:id/views', viewsLimiter, updateViewsHandler);
