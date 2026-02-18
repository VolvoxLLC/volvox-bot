/**
 * Zod validation schemas for the changes endpoint
 */

import { z } from 'zod';

/**
 * Query parameters for GET /api/changes
 */
export const changesQuerySchema = z.object({
  since: z.string().refine(
    (val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    },
    { message: 'since must be a valid ISO 8601 timestamp' }
  ),
  full: z
    .enum(['true', 'false'])
    .optional()
    .transform((val) => val === 'true'),
  types: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        const validTypes = ['tasks', 'comments', 'activity', 'broadcasts'];
        const requested = val.split(',').map((t) => t.trim());
        return requested.every((t) => validTypes.includes(t));
      },
      { message: 'types must be a comma-separated list of: tasks,comments,activity,broadcasts' }
    ),
});

export type ChangesQueryInput = z.infer<typeof changesQuerySchema>;
