import { z } from 'zod';
import { dbType } from './common';

// All cluster endpoints accept the target database as either `databaseName`
// (canonical) or `database` (legacy alias still emitted by some frontend
// call sites). Centralizing this here keeps create / update / test in
// lockstep — adding a field on one shouldn't silently drift from the others.
const clusterFieldsBase = z.object({
  name: z.string().trim().min(1).max(100),
  dbType,
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  databaseName: z.string().trim().min(1).max(100).optional(),
  database: z.string().trim().min(1).max(100).optional(),
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(500),
});

// Normalizes the alias so controllers always see `databaseName` regardless
// of which field name the client sent. Applied via .transform so the
// validate middleware writes the canonical shape back onto req.body.
const normalizeDatabaseAlias = <
  T extends { databaseName?: string; database?: string },
>(v: T) => ({
  ...v,
  databaseName: (v.databaseName || v.database) as string | undefined,
});

export const createClusterBody = clusterFieldsBase
  .refine((v) => !!(v.databaseName || v.database), {
    message: 'databaseName is required',
    path: ['databaseName'],
  })
  .transform(normalizeDatabaseAlias)
  // After the refine + transform, databaseName is guaranteed to be set —
  // assert that in the inferred output type so the controller doesn't have
  // to deal with a phantom-optional field.
  .transform((v) => ({ ...v, databaseName: v.databaseName as string }));

export const updateClusterBody = clusterFieldsBase
  .partial()
  .extend({
    status: z.enum(['active', 'inactive']).optional(),
  })
  .transform(normalizeDatabaseAlias);

// Standalone connection test (no saved cluster). Same alias rules — we
// require at least one of the two field names to be present.
export const testConnectionBody = clusterFieldsBase
  .pick({
    dbType: true,
    host: true,
    port: true,
    databaseName: true,
    database: true,
    username: true,
    password: true,
  })
  .refine((v) => !!(v.databaseName || v.database), {
    message: 'databaseName is required',
    path: ['databaseName'],
  })
  .transform(normalizeDatabaseAlias);

export const updateRowBody = z.object({
  originalRow: z.record(z.string(), z.unknown()),
  updatedRow: z.record(z.string(), z.unknown()),
});

export type CreateClusterInput = z.infer<typeof createClusterBody>;
export type UpdateClusterInput = z.infer<typeof updateClusterBody>;
export type TestConnectionInput = z.infer<typeof testConnectionBody>;
