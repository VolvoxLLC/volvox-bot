import { z } from 'zod';
import { TaskIdSchema, optionalPositiveInt } from './common.js';

/**
 * GET/POST /api/preview/:taskId/* - path params
 */
export const PreviewParamsSchema = z.object({
  taskId: TaskIdSchema,
});

/**
 * GET /api/preview/:taskId/output - query params
 */
export const PreviewOutputQuerySchema = z.object({
  lines: optionalPositiveInt(50, { min: 1, max: 1000 }),
});

export type PreviewParams = z.infer<typeof PreviewParamsSchema>;
export type PreviewOutputQuery = z.infer<typeof PreviewOutputQuerySchema>;
