import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../utils/httpError';

// Standard Postgres SQLSTATE codes that map to specific HTTP statuses. The
// individual controllers used to do this mapping by hand; centralizing it
// here lets controllers stay terse — they `throw new HttpError(...)` for
// known business errors and let raw pg errors bubble untouched.
const PG_ERROR_MAP: Record<string, { status: number; message: string }> = {
  '23505': { status: 409, message: 'Resource already exists' },
  '23503': { status: 400, message: 'Referenced record does not exist' },
  '23502': { status: 400, message: 'Missing required field' },
  '23514': { status: 400, message: 'Value violates a constraint' },
  '22P02': { status: 400, message: 'Invalid value format' },
  '42703': { status: 500, message: 'Schema mismatch' },
};

export const errorHandler = (err: any, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);

  // Validation issues from zod schemas carry a structured `details.issues`
  // array. Pass it through (in non-prod) so the client can highlight fields.
  let status = 500;
  let message = 'Internal server error';
  let details: unknown = err?.details;
  let exposeInProd = false;

  if (err instanceof HttpError) {
    status = err.status;
    message = err.message;
    exposeInProd = err.exposeDetails;
  } else if (typeof err?.code === 'string' && PG_ERROR_MAP[err.code]) {
    const mapped = PG_ERROR_MAP[err.code];
    status = mapped.status;
    message = mapped.message;
    if (details === undefined) {
      details = { code: err.code, constraint: err.constraint, column: err.column, detail: err.detail };
    }
  } else if (err?.status && err?.message) {
    status = err.status;
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message || message;
  }

  console.error('Unhandled error:', err);

  // `details` can carry internal context (pg fields, failed SQL fragments,
  // zod issues). Only surface it outside production where operators are
  // expected to be debugging.
  const body: { error: string; details?: unknown } = { error: message };
  if (details !== undefined && (exposeInProd || process.env.NODE_ENV !== 'production')) {
    body.details = details;
  }
  res.status(status).json(body);
};
