/**
 * Integration-style tests for the auth router. We stub the user model so no
 * Postgres connection is needed — the goal is to lock in the route wiring,
 * the role-handling contract (P0 fix), and the rate-limiter shape (P1 fix).
 */

import request from 'supertest';

jest.mock('../models/user.model', () => {
  const createdUsers: any[] = [];
  return {
    __createdUsers: createdUsers,
    findUserByEmail: jest.fn(async () => null),
    findUserById: jest.fn(async (id: string) => createdUsers.find((u) => u.id === id) || null),
    createUser: jest.fn(async (email: string, _hash: string, firstName: string, lastName: string, role: string) => {
      const u = { id: `user-${createdUsers.length + 1}`, email, first_name: firstName, last_name: lastName, role, is_active: true };
      createdUsers.push(u);
      return u;
    }),
    saveRefreshToken: jest.fn(async () => undefined),
    findRefreshToken: jest.fn(async () => null),
    deleteRefreshToken: jest.fn(async () => undefined),
    deleteAllUserRefreshTokens: jest.fn(async () => undefined),
  };
});

// Import AFTER the mock is set up — app.ts → routes → controller imports
// user.model at the top of the file and the mock has to be in place first.
import app from '../app';
const userModel = require('../models/user.model');

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    userModel.__createdUsers.length = 0;
    userModel.findUserByEmail.mockClear();
    userModel.createUser.mockClear();
  });

  it('400s when required fields are missing', async () => {
    const res = await request(app).post('/api/auth/signup').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
    // zod produces field-targeted messages like
    //   "Invalid password: Invalid input: expected string, received undefined"
    expect(res.body.error).toMatch(/^Invalid /);
  });

  it('creates an account with role=developer regardless of body input (P0)', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      email: 'sneaky@x.com',
      password: 'hunter2hunter2',
      firstName: 'S',
      lastName: 'X',
      role: 'admin', // attacker-supplied — must be ignored
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('developer');
    expect(userModel.createUser).toHaveBeenCalledTimes(1);
    const [, , , , createdRole] = userModel.createUser.mock.calls[0];
    expect(createdRole).toBe('developer');
  });

  it('409s when the email is already registered', async () => {
    userModel.findUserByEmail.mockResolvedValueOnce({ id: 'existing', email: 'taken@x.com' });
    const res = await request(app).post('/api/auth/signup').send({
      email: 'taken@x.com',
      password: 'hunter2hunter2',
      firstName: 'A',
      lastName: 'B',
    });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/signup/architect', () => {
  it('rejects unauthenticated callers with 401 (P0: admin-only)', async () => {
    const res = await request(app).post('/api/auth/signup/architect').send({
      email: 'arch@x.com',
      password: 'hunter2hunter2',
      firstName: 'A',
      lastName: 'R',
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-admin authenticated callers with 403', async () => {
    // Forge a developer access token using the same secret the app boots with.
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: 'u-dev', email: 'dev@x.com', role: 'developer' },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: '5m' },
    );
    const res = await request(app)
      .post('/api/auth/signup/architect')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'arch@x.com', password: 'hunter2hunter2', firstName: 'A', lastName: 'R' });
    expect(res.status).toBe(403);
  });
});

describe('auth rate limiter (P1)', () => {
  it('starts returning 429 once the per-window cap is exceeded', async () => {
    // Cap is 30 per 15 min in app.ts; loop just past it and check the tail.
    // Using a unique IP via the X-Forwarded-For header (trust proxy is on)
    // so this test's bucket doesn't interfere with other tests.
    const ip = '203.0.113.42';
    let lastStatus = 0;
    for (let i = 0; i < 35; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'nope@x.com', password: 'wrong' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
