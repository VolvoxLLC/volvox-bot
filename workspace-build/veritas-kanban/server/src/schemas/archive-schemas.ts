import { z } from 'zod';

/**
 * POST /api/tasks/bulk-archive - Archive multiple tasks by sprint
 */
export const BulkArchiveBodySchema = z.object({
  sprint: z.string().min(1, 'Sprint is required'),
});

export type BulkArchiveBody = z.infer<typeof BulkArchiveBodySchema>;
