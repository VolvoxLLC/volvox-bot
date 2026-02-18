import { z } from 'zod';

/**
 * PUT /api/config/default-agent - Set default agent
 */
export const SetDefaultAgentBodySchema = z.object({
  agent: z.string().min(1, 'Agent type is required'),
});

export type SetDefaultAgentBody = z.infer<typeof SetDefaultAgentBodySchema>;

/**
 * POST /api/config/repos/validate - Validate repo path
 */
export const ValidateRepoPathBodySchema = z.object({
  path: z.string().min(1, 'Path is required'),
});

export type ValidateRepoPathBody = z.infer<typeof ValidateRepoPathBodySchema>;
