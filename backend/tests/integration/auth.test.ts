import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../../src/app';
import { requireAuth, requireRole } from '../../src/middleware/auth';
import { errorHandler } from '../../src/middleware/error-handler';
import { UserModel } from '../../src/models/user.model';
import { bearer, signupAs } from '../helpers/auth';
import { useTestDb } from '../setup/db';

const app = createApp();
const SECRET = process.env.JWT_SECRET ?? '';

describe('auth', () => {
  useTestDb();

  describe('POST /api/auth/signup', () => {
    it('creates a user, normalises the email and returns a token without the password hash', async () => {
      const res = await request(app).post('/api/auth/signup').send({
        name: '  Acme Brand ',
        email: ' Brand@Example.COM ',
        password: 'password123',
        role: 'brand',
      });

      expect(res.status).toBe(201);
      expect(typeof res.body.token).toBe('string');
      expect(res.body.user).toEqual({
        id: expect.any(String),
        name: 'Acme Brand',
        email: 'brand@example.com',
        role: 'brand',
        createdAt: expect.any(String),
      });
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('rejects a duplicate email regardless of case with 409 EMAIL_TAKEN', async () => {
      const body = {
        name: 'First',
        email: 'dup@example.com',
        password: 'password123',
        role: 'creator',
      };
      await request(app).post('/api/auth/signup').send(body).expect(201);

      const res = await request(app)
        .post('/api/auth/signup')
        .send({ ...body, email: 'DUP@example.com' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('EMAIL_TAKEN');
    });

    it.each([
      ['a short password', { password: 'short' }, 'password'],
      ['an invalid email', { email: 'not-an-email' }, 'email'],
      ['an unknown role', { role: 'admin' }, 'role'],
      ['an unexpected field', { isAdmin: true }, ''],
    ])('rejects %s with 400 VALIDATION_ERROR', async (_label, override, path) => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          name: 'Someone',
          email: 'someone@example.com',
          password: 'password123',
          role: 'creator',
          ...override,
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path })]),
      );
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns a token for valid credentials', async () => {
      await signupAs(app, 'creator', 'Meme Page');
      const user = await UserModel.findOne({ role: 'creator' }).lean();

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: user?.email.toUpperCase(), password: 'password123' });
      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Meme Page');
      expect(typeof res.body.token).toBe('string');
    });

    it('returns the same 401 for a wrong password and an unknown email', async () => {
      const { user } = await signupAs(app, 'brand');

      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: user.email, password: 'wrong-password' });
      const unknownEmail = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' });

      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownEmail.body);
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/auth/me', () => {
    it('returns the current user for a valid token', async () => {
      const { token, user } = await signupAs(app, 'creator');
      const res = await request(app).get('/api/auth/me').set('Authorization', bearer(token));
      expect(res.status).toBe(200);
      expect(res.body.user).toEqual(user);
    });

    it.each([
      ['no token', undefined],
      ['a malformed header', 'Token abc'],
      ['a garbage token', 'Bearer not.a.jwt'],
      [
        'a token signed with another secret',
        `Bearer ${jwt.sign({ role: 'brand' }, 'x'.repeat(40), { subject: 'a'.repeat(24) })}`,
      ],
      [
        'an expired token',
        `Bearer ${jwt.sign({ role: 'brand' }, SECRET, { subject: 'a'.repeat(24), expiresIn: -10 })}`,
      ],
      [
        'a token with an unknown role',
        `Bearer ${jwt.sign({ role: 'admin' }, SECRET, { subject: 'a'.repeat(24) })}`,
      ],
    ])('rejects %s with 401 UNAUTHENTICATED', async (_label, header) => {
      const req = request(app).get('/api/auth/me');
      const res = header ? await req.set('Authorization', header) : await req;
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects a valid token whose account was deleted', async () => {
      const { token, user } = await signupAs(app, 'brand');
      await UserModel.deleteOne({ _id: user.id });
      const res = await request(app).get('/api/auth/me').set('Authorization', bearer(token));
      expect(res.status).toBe(401);
    });
  });

  describe('requireRole', () => {
    const guarded = express();
    guarded.get('/brand-only', requireAuth, requireRole('brand'), (_req, res) => {
      res.json({ ok: true });
    });
    guarded.use(errorHandler);

    it('allows the matching role', async () => {
      const { token } = await signupAs(app, 'brand');
      await request(guarded).get('/brand-only').set('Authorization', bearer(token)).expect(200);
    });

    it('rejects other roles with 403 FORBIDDEN', async () => {
      const { token } = await signupAs(app, 'creator');
      const res = await request(guarded).get('/brand-only').set('Authorization', bearer(token));
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
