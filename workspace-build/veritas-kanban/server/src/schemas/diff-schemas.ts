import { z } from 'zod';
import { TaskIdSchema, filePathSchema } from './common.js';

/**
 * GET /api/diff/:taskId - path params
 */
export const DiffParamsSchema = z.object({
  taskId: TaskIdSchema,
});

/**
 * GET /api/diff/:taskId/file - query params
 */
export const DiffFileQuerySchema = z.object({
  path: filePathSchema,
});

export type DiffParams = z.infer<typeof DiffParamsSchema>;
export type DiffFileQuery = z.infer<typeof DiffFileQuerySchema>;
