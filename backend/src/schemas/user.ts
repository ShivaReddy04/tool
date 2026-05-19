import { z } from 'zod';

export const changeRoleBody = z.object({
  role: z.enum(['developer', 'architect', 'admin', 'viewer']),
});

export type ChangeRoleInput = z.infer<typeof changeRoleBody>;
