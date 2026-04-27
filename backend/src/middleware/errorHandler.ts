import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/httpError';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const status = err?.status || 500;
  const message = err?.message || 'Internal server error';
  const details = err?.details || undefined;
  console.error('Unhandled error:', err);
  res.status(status).json({ error: message, details });
};
