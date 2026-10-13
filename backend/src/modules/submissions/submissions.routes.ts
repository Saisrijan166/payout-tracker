import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import { createSubmissionHandler, listMySubmissionsHandler } from './submissions.controller';

export const submissionsRouter = Router();

submissionsRouter.post('/', requireAuth, requireRole('creator'), createSubmissionHandler);
submissionsRouter.get('/mine', requireAuth, requireRole('creator'), listMySubmissionsHandler);
