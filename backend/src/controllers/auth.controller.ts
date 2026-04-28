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
import { TokenPayload } from '../types';

export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, firstName, lastName, role } = req.body;

    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({ error: 'All fields are required' });
      return;
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await createUser(email, passwordHash, firstName, lastName, (role ? role.toLowerCase() : 'developer') as any);

    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
    const tokens = generateTokens(payload);

    const refreshTokenHash = hashToken(tokens.refreshToken);
    await saveRefreshToken(user.id, refreshTokenHash, getRefreshTokenExpiry());

    res.status(201).json({
      token: tokens.accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
      },
      ...tokens,
    });
  } catch (err) {
    console.error('Signup error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await findUserByEmail(email) as any;
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (!user.is_active) {
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
    const tokens = generateTokens(payload);

    const refreshTokenHash = hashToken(tokens.refreshToken);
    await saveRefreshToken(user.id, refreshTokenHash, getRefreshTokenExpiry());

    res.json({
      token: tokens.accessToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
      },
      ...tokens,
    });
  } catch (err) {
    console.error('Login error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: errorMessage });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const tokenPayload = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);

    const storedToken = await findRefreshToken(tokenHash);
    if (!storedToken) {
      res.status(401).json({ error: 'Invalid refresh token' });
      return;
    }

    await deleteRefreshToken(tokenHash);

    const user = await findUserById(tokenPayload.userId);
    if (!user || !user.is_active) {
      res.status(401).json({ error: 'User not found or deactivated' });
      return;
    }

    const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
    const tokens = generateTokens(payload);

    const newTokenHash = hashToken(tokens.refreshToken);
    await saveRefreshToken(user.id, newTokenHash, getRefreshTokenExpiry());

    res.json(tokens);
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await deleteRefreshToken(tokenHash);
    }

    if (req.user) {
      await deleteAllUserRefreshTokens(req.user.userId);
    }

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const user = await findUserById(req.user.userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Helper to create account with fixed role
export const signupDeveloper = async (req: Request, res: Response): Promise<void> => {
  try {
    req.body.role = 'developer';
    await signup(req, res);
  } catch (err) {
    console.error('signupDeveloper error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const signupArchitect = async (req: Request, res: Response): Promise<void> => {
  try {
    req.body.role = 'architect';
    await signup(req, res);
  } catch (err) {
    console.error('signupArchitect error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Login variants that enforce role
const loginWithRole = (expectedRole: string) => {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
      }

      const user = await findUserByEmail(email) as any;
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      if (!user.is_active) {
        res.status(403).json({ error: 'Account is deactivated' });
        return;
      }

      const expectedRoleLower = expectedRole.toLowerCase();
      if (user.role !== expectedRoleLower) {
        res.status(403).json({ error: `Account is not a ${expectedRole}` });
        return;
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
      }

      const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
      const tokens = generateTokens(payload);

      const refreshTokenHash = hashToken(tokens.refreshToken);
      await saveRefreshToken(user.id, refreshTokenHash, getRefreshTokenExpiry());

      res.json({
        token: tokens.accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
        },
        ...tokens,
      });
    } catch (err) {
      console.error('LoginWithRole error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

export const loginDeveloper = loginWithRole('DEVELOPER');
export const loginArchitect = loginWithRole('ARCHITECT');
