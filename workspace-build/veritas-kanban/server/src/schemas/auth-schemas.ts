import { z } from 'zod';

/**
 * POST /api/auth/setup - First-time password setup
 */
export const AuthSetupBodySchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export type AuthSetupBody = z.infer<typeof AuthSetupBodySchema>;

/**
 * POST /api/auth/login - Login with password
 */
export const AuthLoginBodySchema = z.object({
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

export type AuthLoginBody = z.infer<typeof AuthLoginBodySchema>;

/**
 * POST /api/auth/recover - Reset password using recovery key
 */
export const AuthRecoverBodySchema = z.object({
  recoveryKey: z.string().min(1, 'Recovery key is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export type AuthRecoverBody = z.infer<typeof AuthRecoverBodySchema>;

/**
 * POST /api/auth/change-password - Change password
 */
export const AuthChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export type AuthChangePasswordBody = z.infer<typeof AuthChangePasswordBodySchema>;

/**
 * POST /api/auth/rotate-secret - Rotate JWT secret
 */
export const AuthRotateSecretBodySchema = z
  .object({
    gracePeriodDays: z.number().min(0).max(90).optional(),
  })
  .optional()
  .default({});

export type AuthRotateSecretBody = z.infer<typeof AuthRotateSecretBodySchema>;
