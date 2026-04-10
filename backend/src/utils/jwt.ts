import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { TokenPayload, AuthTokens } from '../types';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dart-access-secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dart-refresh-secret';
const ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY as any });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY as any });
};

export const generateTokens = (payload: TokenPayload): AuthTokens => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, ACCESS_SECRET) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, REFRESH_SECRET) as TokenPayload;
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const getRefreshTokenExpiry = (): Date => {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);
  return expiry;
};
