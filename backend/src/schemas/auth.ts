import { z } from 'zod';

export const signupBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  // Self-service role selection on the public signup form. Restricted to the
  // two non-privileged roles — 'admin' can never be self-assigned. Optional so
  // existing callers that omit it still default to developer.
  role: z.enum(['developer', 'architect']).optional(),
});

export const loginBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export const refreshTokenBody = z
  .object({ refreshToken: z.string().min(1).optional() })
  .optional();

export const logoutBody = z
  .object({ refreshToken: z.string().min(1).optional() })
  .optional();

export type SignupInput = z.infer<typeof signupBody>;
export type LoginInput = z.infer<typeof loginBody>;
