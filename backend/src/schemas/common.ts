import { z } from 'zod';

/**
 * Reusable zod primitives. We use Postgres-shape constraints (uuid v4, the
 * SQL identifier rule, varchar lengths) here so the request boundary
 * matches what the DB will accept — bad input is rejected before any query.
 */

export const uuid = z.string().uuid();

// Standard SQL-identifier rule: starts with a letter or underscore, then
// letters/digits/underscores only. Matches `utils/validation.ts`.
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const sqlIdentifier = (label: string, maxLen = 255) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(maxLen, `${label} must be ${maxLen} characters or fewer`)
    .regex(IDENT_RE, `${label} may contain only letters, digits, and underscores, and must not start with a digit`);

export const schemaName = sqlIdentifier('Schema name', 100);
export const tableName = sqlIdentifier('Table name', 255);
export const columnName = sqlIdentifier('Column name', 255);

export const dbType = z.enum(['postgresql', 'mysql', 'mssql', 'redshift']);
