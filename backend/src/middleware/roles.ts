import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/httpError';

export const checkRole = (role: string) => {
  const normalized = role.toLowerCase();
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new HttpError(401, 'Not authenticated'));
    }
    const userRole = (req.user as any).role as string | undefined;
    if (!userRole) return next(new HttpError(403, 'User has no role'));
    if (userRole.toLowerCase() !== normalized) {
      return next(new HttpError(403, 'Insufficient permissions'));
    }
    next();
  };
};
