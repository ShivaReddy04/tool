import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import {
  findUserByEmail,
  findUserById,
  createUser,
  saveRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  deleteAllUserRefreshTokens,
} from '../models/user.model';
import { generateTokens, verifyRefreshToken, hashToken, getRefreshTokenExpiry } from '../utils/jwt';
import { HttpError } from '../utils/httpError';
import { TokenPayload, UserRole } from '../types';
import type { SignupInput, LoginInput } from '../schemas/auth';

// In production the frontend and backend live on different *.onrender.com
// subdomains, which the browser treats as cross-site (onrender.com is on the
// Public Suffix List). sameSite=lax would silently drop the cookie on those
// cross-site XHRs, so use 'none' + secure when in prod.
const isProd = process.env.NODE_ENV === 'production';
const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

const buildSessionResponse = (
  user: { id: string; email: string; first_name: string; last_name: string; role: UserRole },
) => {
  const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
  const tokens = generateTokens(payload);
  return {
    tokens,
    body: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
      },
    },
  };
};

// Internal account-creation helper. The caller chooses the role — request
// bodies are never trusted to set privilege level. Route handlers above
// determine which role is being created and whether the caller is allowed
// to create it (e.g. /signup is public + developer-only; /signup/architect
// is gated behind admin auth in the router).
const createAccount = async (req: Request, res: Response, role: UserRole): Promise<void> => {
  const { email, password, firstName, lastName } = req.body as SignupInput;

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new HttpError(409, 'Email already registered');
  }

  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(password, salt);
  const user = await createUser(email, passwordHash, firstName, lastName, role);

  const { tokens, body } = buildSessionResponse(user);
  await saveRefreshToken(user.id, hashToken(tokens.refreshToken), getRefreshTokenExpiry());
  res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);
  res.status(201).json(body);
};

export const signup = (req: Request, res: Response): Promise<void> => createAccount(req, res, 'developer');
export const signupDeveloper = (req: Request, res: Response): Promise<void> => createAccount(req, res, 'developer');
// Architect accounts must not be self-served — the route mounts this behind
// authenticate + authorize('admin'), so by the time we get here we already
// know the caller is an admin.
export const signupArchitect = (req: Request, res: Response): Promise<void> => createAccount(req, res, 'architect');

const authenticateCredentials = async (email: string, password: string, expectedRole?: UserRole) => {
  const user = (await findUserByEmail(email)) as any;
  if (!user) throw new HttpError(401, 'Invalid credentials');
  if (!user.is_active) throw new HttpError(403, 'Account is deactivated');
  if (expectedRole && user.role !== expectedRole) {
    throw new HttpError(403, `Account is not a ${expectedRole}`);
  }
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) throw new HttpError(401, 'Invalid credentials');
  return user;
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as LoginInput;
  const user = await authenticateCredentials(email, password);
  const { tokens, body } = buildSessionResponse(user);
  await saveRefreshToken(user.id, hashToken(tokens.refreshToken), getRefreshTokenExpiry());
  res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);
  res.json(body);
};

const loginWithRole = (expectedRole: UserRole) => async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as LoginInput;
  const user = await authenticateCredentials(email, password, expectedRole);
  const { tokens, body } = buildSessionResponse(user);
  await saveRefreshToken(user.id, hashToken(tokens.refreshToken), getRefreshTokenExpiry());
  // Legacy field kept alongside accessToken — some clients still read `token`.
  res.json({ token: tokens.accessToken, ...body });
};

export const loginDeveloper = loginWithRole('developer');
export const loginArchitect = loginWithRole('architect');

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const presented = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!presented) throw new HttpError(400, 'Refresh token is required');

  let tokenPayload: TokenPayload;
  try {
    tokenPayload = verifyRefreshToken(presented);
  } catch {
    throw new HttpError(401, 'Invalid refresh token');
  }

  const tokenHash = hashToken(presented);
  const storedToken = await findRefreshToken(tokenHash);
  if (!storedToken) throw new HttpError(401, 'Invalid refresh token');

  await deleteRefreshToken(tokenHash);

  const user = await findUserById(tokenPayload.userId);
  if (!user || !user.is_active) throw new HttpError(401, 'User not found or deactivated');

  const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
  const tokens = generateTokens(payload);
  await saveRefreshToken(user.id, hashToken(tokens.refreshToken), getRefreshTokenExpiry());
  res.json(tokens);
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const bodyToken = req.body?.refreshToken;
  if (bodyToken) {
    await deleteRefreshToken(hashToken(bodyToken));
  }
  if (req.user) {
    await deleteAllUserRefreshTokens(req.user.userId);
  }
  res.json({ message: 'Logged out successfully' });
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new HttpError(401, 'Not authenticated');
  const user = await findUserById(req.user.userId);
  if (!user) throw new HttpError(404, 'User not found');
  res.json({
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    isActive: user.is_active,
    createdAt: user.created_at,
  });
};
