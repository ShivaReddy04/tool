import { z } from 'zod';

export const signupBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
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
