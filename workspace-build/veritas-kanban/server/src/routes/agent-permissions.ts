/**
 * Agent Permission API Routes
 *
 * GET    /api/agents/permissions                  — List all agent permissions
 * GET    /api/agents/permissions/:id              — Get agent permission config
 * PUT    /api/agents/permissions/:id/level        — Set permission level
 * PATCH  /api/agents/permissions/:id              — Update permission fields
 * POST   /api/agents/permissions/check            — Check if agent can perform action
 * POST   /api/agents/permissions/approvals        — Request approval (intern)
 * GET    /api/agents/permissions/approvals         — Get pending approvals
 * POST   /api/agents/permissions/approvals/:id    — Review approval request
 */

import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { getAgentPermissionService } from '../services/agent-permission-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { NotFoundError } from '../middleware/error-handler.js';

const router: RouterType = Router();

/**
 * GET /api/agents/permissions
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const service = getAgentPermissionService();
    const permissions = await service.listPermissions();
    res.json(permissions);
  })
);

/**
 * GET /api/agents/permissions/approvals
 */
router.get(
  '/approvals',
  asyncHandler(async (req, res) => {
    const service = getAgentPermissionService();
    const approvals = await service.getPendingApprovals({
      agentId: req.query.agentId as string,
    });
    res.json(approvals);
  })
);

/**
 * GET /api/agents/permissions/:id
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const service = getAgentPermissionService();
    const config = await service.getPermissions(String(req.params.id));
    res.json(config);
  })
);

/**
 * PUT /api/agents/permissions/:id/level
 */
router.put(
  '/:id/level',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      level: z.enum(['intern', 'specialist', 'lead']),
    });
    const { level } = schema.parse(req.body);
    const service = getAgentPermissionService();
    const config = await service.setLevel(String(req.params.id), level);
    res.json(config);
  })
);

/**
 * PATCH /api/agents/permissions/:id
 */
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      trustedDomains: z.array(z.string()).optional(),
      canCreateTasks: z.boolean().optional(),
      canDelegate: z.boolean().optional(),
      canApprove: z.boolean().optional(),
      autoComplete: z.boolean().optional(),
      restrictions: z.array(z.string()).optional(),
    });
    const update = schema.parse(req.body);
    const service = getAgentPermissionService();
    const config = await service.updatePermissions(String(req.params.id), update);
    res.json(config);
  })
);

/**
 * POST /api/agents/permissions/check
 */
router.post(
  '/check',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      agentId: z.string().min(1),
      action: z.string().min(1),
    });
    const { agentId, action } = schema.parse(req.body);
    const service = getAgentPermissionService();
    const result = await service.checkPermission(agentId, action);
    res.json(result);
  })
);

/**
 * POST /api/agents/permissions/approvals
 */
router.post(
  '/approvals',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      agentId: z.string().min(1),
      action: z.string().min(1),
      taskId: z.string().optional(),
      details: z.string().optional(),
    });
    const data = schema.parse(req.body);
    const service = getAgentPermissionService();
    const request = await service.requestApproval(data);
    res.status(201).json(request);
  })
);

/**
 * POST /api/agents/permissions/approvals/:id
 */
router.post(
  '/approvals/:id',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      decision: z.enum(['approved', 'rejected']),
      reviewedBy: z.string().min(1),
    });
    const { decision, reviewedBy } = schema.parse(req.body);
    const service = getAgentPermissionService();
    const result = await service.reviewApproval(String(req.params.id), decision, reviewedBy);
    if (!result) throw new NotFoundError('Approval request not found');
    res.json(result);
  })
);

export { router as agentPermissionRoutes };
