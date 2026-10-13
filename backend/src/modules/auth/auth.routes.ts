import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rate-limit';
import { loginHandler, meHandler, signupHandler } from './auth.controller';

export const authRouter = Router();

authRouter.post('/signup', authLimiter, signupHandler);
authRouter.post('/login', authLimiter, loginHandler);
authRouter.get('/me', requireAuth, meHandler);
