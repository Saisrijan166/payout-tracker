import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middleware/auth';
import { LoginSchema, SignupSchema } from './auth.schemas';
import { getCurrentUser, login, signup } from './auth.service';

export const signupHandler: RequestHandler = async (req, res) => {
  const input = SignupSchema.parse(req.body);
  res.status(201).json(await signup(input));
};

export const loginHandler: RequestHandler = async (req, res) => {
  const input = LoginSchema.parse(req.body);
  res.json(await login(input));
};

export const meHandler: RequestHandler = async (req, res) => {
  const user = await getCurrentUser(getAuthUser(req).id);
  res.json({ user });
};
