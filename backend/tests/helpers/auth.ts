import type { Express } from 'express';
import request from 'supertest';
import type { Role } from '../../src/models/user.model';
import type { AuthResult } from '../../src/modules/auth/auth.service';

let counter = 0;

/** Signs up a fresh user through the API and returns the token and user DTO. */
export async function signupAs(app: Express, role: Role, name?: string): Promise<AuthResult> {
  counter += 1;
  const res = await request(app)
    .post('/api/auth/signup')
    .send({
      name: name ?? `${role} ${counter}`,
      email: `${role}${counter}@example.com`,
      password: 'password123',
      role,
    });
  if (res.status !== 201) {
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as AuthResult;
}

export const bearer = (token: string): string => `Bearer ${token}`;
