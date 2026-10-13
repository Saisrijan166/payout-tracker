import { z } from 'zod';
import { ROLES } from '../../models/user.model';

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);

export const SignupSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
    email,
    // bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently truncated.
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters'),
    role: z.enum(ROLES),
  })
  .strict();

export const LoginSchema = z
  .object({
    email,
    password: z.string().min(1, 'Password is required').max(72),
  })
  .strict();

export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
