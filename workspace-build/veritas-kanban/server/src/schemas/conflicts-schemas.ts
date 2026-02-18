import { z } from 'zod';
import { TaskIdSchema, filePathSchema } from './common.js';

/**
 * GET/POST /api/conflicts/:taskId/* - path params
 */
export const ConflictParamsSchema = z.object({
  taskId: TaskIdSchema,
});

/**
 * GET/POST /api/conflicts/:taskId/file|resolve - query params
 */
export const ConflictFileQuerySchema = z.object({
  path: filePathSchema,
});

/**
 * POST /api/conflicts/:taskId/resolve - body
 */
export const ResolveConflictBodySchema = z.object({
  resolution: z.enum(['ours', 'theirs', 'manual']),
  manualContent: z.string().optional(),
}).refine(
  (data) => data.resolution !== 'manual' || data.manualContent !== undefined,
  { message: 'manualContent is required when resolution is "manual"' }
);

/**
 * POST /api/conflicts/:taskId/continue - body
 */
export const ContinueMergeBodySchema = z.object({
  message: z.string().optional(),
});

export type ConflictParams = z.infer<typeof ConflictParamsSchema>;
export type ConflictFileQuery = z.infer<typeof ConflictFileQuerySchema>;
export type ResolveConflictBody = z.infer<typeof ResolveConflictBodySchema>;
export type ContinueMergeBody = z.infer<typeof ContinueMergeBodySchema>;
