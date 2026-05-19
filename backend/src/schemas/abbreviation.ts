import { z } from 'zod';

const entry = z.object({
  full: z.string().trim().min(1),
  abbreviation: z.string()
    .trim()
    .min(1)
    .regex(/^[A-Za-z0-9]+$/, 'abbreviation must be alphanumeric (it lands in a SQL identifier)'),
});

export const replaceAbbreviationsBody = z.object({
  entries: z.array(entry),
});

export const previewNamingBody = z.object({
  entityLogicalName: z.string().optional(),
  tableName: z.string().optional(),
});

export type ReplaceAbbreviationsInput = z.infer<typeof replaceAbbreviationsBody>;
export type PreviewNamingInput = z.infer<typeof previewNamingBody>;
