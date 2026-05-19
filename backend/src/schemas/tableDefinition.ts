import { z } from 'zod';
import { uuid, schemaName, tableName, columnName } from './common';

const distributionStyle = z.enum(['KEY', 'EVEN', 'ALL', 'AUTO']);
const businessArea = z.enum(['XBI Tables', 'Database Source']);
const columnAction = z.enum(['No Change', 'Modify', 'Add', 'Drop']);

const columnInput = z.object({
  column_name: columnName,
  data_type: z.string().trim().min(1, 'Column requires a data type'),
  is_nullable: z.boolean().optional(),
  is_primary_key: z.boolean().optional(),
  data_classification: z.string().trim().optional().nullable(),
  data_domain: z.string().trim().optional().nullable(),
  attribute_definition: z.string().trim().optional().nullable(),
  default_value: z.string().optional().nullable(),
  action: columnAction.optional(),
  sort_order: z.number().int().optional(),
  original_column_name: z.string().optional().nullable(),
}).passthrough();

export const saveTableDefinitionBody = z.object({
  table: z.object({
    id: z.string().optional(),
    connection_id: uuid,
    database_name: z.string().trim().min(1).max(100),
    schema_name: schemaName,
    table_name: tableName,
    entity_logical_name: z.string().trim().optional().nullable(),
    distribution_style: distributionStyle.optional().nullable(),
    keys: z.any().optional(),
    vertical_name: z.string().trim().optional().nullable(),
    business_area: businessArea.optional().nullable(),
    definition: z.string().trim().optional().nullable().transform((v) => (v && v.length > 0 ? v : null)),
    status: z.string().trim().optional(),
    created_by: z.string().optional(),
  }).passthrough(),
  columns: z.array(columnInput).default([]),
}).superRefine((val, ctx) => {
  const seen = new Set<string>();
  for (let i = 0; i < val.columns.length; i++) {
    const lower = val.columns[i].column_name.toLowerCase();
    if (seen.has(lower)) {
      ctx.addIssue({
        code: 'custom',
        path: ['columns', i, 'column_name'],
        message: `Duplicate column name "${val.columns[i].column_name}"`,
      });
    }
    seen.add(lower);
  }
});

export const dryRunTableBody = z.object({
  table: z.object({
    connection_id: uuid,
    schema_name: z.string().trim().optional(),
    table_name: z.string().trim().min(1),
  }).passthrough(),
  columns: z.array(z.object({
    column_name: z.string().trim().min(1),
    data_type: z.string().trim().min(1),
    is_nullable: z.boolean().optional(),
  })).default([]),
});

export const tableByKeyQuery = z.object({
  connectionId: uuid,
  database: z.string().trim().min(1),
  schema: z.string().trim().min(1),
  table: z.string().trim().min(1),
});

export const listTableDefinitionsQuery = z.object({
  connectionId: uuid,
  schemaName: z.string().trim().min(1),
});

export type SaveTableDefinitionInput = z.infer<typeof saveTableDefinitionBody>;
export type DryRunTableInput = z.infer<typeof dryRunTableBody>;
