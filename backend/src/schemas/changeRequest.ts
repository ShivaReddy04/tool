import { z } from 'zod';
import { uuid } from './common';

export const createChangeRequestBody = z.object({
  connection_id: uuid,
  database_name: z.string().trim().min(1).optional(),
  schema_name: z.string().trim().min(1).optional(),
  table_name: z.string().trim().min(1),
  row_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
  old_data: z.record(z.string(), z.unknown()),
  new_data: z.record(z.string(), z.unknown()),
});

export type CreateChangeRequestInput = z.infer<typeof createChangeRequestBody>;
