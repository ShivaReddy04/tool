import { z } from 'zod';
import { schemaName, uuid } from './common';

export const addSchemaBody = z.object({
  name: schemaName,
  clusterId: uuid,
});

export type AddSchemaInput = z.infer<typeof addSchemaBody>;
