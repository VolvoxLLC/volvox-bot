import { z } from 'zod';

/**
 * POST /api/tasks/:id/time/entry - Add manual time entry
 */
export const AddTimeEntryBodySchema = z.object({
  duration: z.number().positive('Duration must be a positive number (in seconds)'),
  description: z.string().optional(),
});

export type AddTimeEntryBody = z.infer<typeof AddTimeEntryBodySchema>;
