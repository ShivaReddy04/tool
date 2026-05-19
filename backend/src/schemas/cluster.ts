import { z } from 'zod';
import { dbType } from './common';

export const createClusterBody = z.object({
  name: z.string().trim().min(1).max(100),
  dbType,
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  databaseName: z.string().trim().min(1).max(100),
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(500),
});

export const updateClusterBody = createClusterBody
  .partial()
  .extend({
    status: z.enum(['active', 'inactive']).optional(),
  });

// Standalone connection test (no saved cluster). Accept `database` as an
// alias for `databaseName` because some frontend call sites still send it.
export const testConnectionBody = z.object({
  dbType,
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  databaseName: z.string().trim().min(1).max(100).optional(),
  database: z.string().trim().min(1).max(100).optional(),
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(500),
}).refine((v) => v.databaseName || v.database, {
  message: 'databaseName is required',
  path: ['databaseName'],
});

export const introspectQuery = z.object({
  database: z.string().trim().min(1).optional(),
  schema: z.string().trim().min(1).optional(),
  table: z.string().trim().min(1).optional(),
});

export const updateRowBody = z.object({
  originalRow: z.record(z.string(), z.unknown()),
  updatedRow: z.record(z.string(), z.unknown()),
});

export type CreateClusterInput = z.infer<typeof createClusterBody>;
export type UpdateClusterInput = z.infer<typeof updateClusterBody>;
export type TestConnectionInput = z.infer<typeof testConnectionBody>;
