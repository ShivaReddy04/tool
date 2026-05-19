import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { HttpError } from '../utils/httpError';

type Source = 'body' | 'params' | 'query';

/**
 * Express middleware factory that runs a Zod schema against the named request
 * slot and replaces it with the parsed (and type-coerced) result. Validation
 * failures become a 400 HttpError carrying the structured zod issue list so
 * the global errorHandler can serialize a useful response.
 *
 * Usage:
 *   router.post('/foo', validate(fooSchema), controller);
 *
 * The replacement is intentional — once a controller declares "I validated my
 * body with zod schema X", we want `req.body` to be the parsed X, not the raw
 * untyped input. Express 5's `req.body` is settable; `req.params` and
 * `req.query` are not enumerable-writable in the same way, so for those slots
 * the parsed result is hung on `(req as any).validated` instead of replacing
 * the original.
 */
export const validate = <T>(schema: ZodSchema<T>, source: Source = 'body') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const input = req[source];
    const result = schema.safeParse(input);
    if (!result.success) {
      next(zodErrorToHttp(result.error));
      return;
    }
    if (source === 'body') {
      req.body = result.data;
    } else {
      (req as any).validated = { ...((req as any).validated || {}), [source]: result.data };
    }
    next();
  };
};

const zodErrorToHttp = (err: ZodError): HttpError => {
  const issues = err.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
    code: i.code,
  }));
  const firstField = issues[0]?.path || 'request';
  return new HttpError(400, `Invalid ${firstField}: ${issues[0]?.message || 'validation failed'}`, { issues });
};
