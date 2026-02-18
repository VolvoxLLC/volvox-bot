/**
 * Notification API Routes
 *
 * GET    /api/notifications              — Get notifications for an agent
 * POST   /api/notifications/:id/delivered — Mark as delivered
 * POST   /api/notifications/delivered-all — Mark all as delivered for an agent
 * POST   /api/notifications/process      — Process a comment for @mentions
 * GET    /api/notifications/stats         — Notification statistics
 * GET    /api/notifications/subscriptions/:taskId — Thread subscriptions
 */

import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { getNotificationService } from '../services/notification-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { NotFoundError } from '../middleware/error-handler.js';

const router: RouterType = Router();

/**
 * GET /api/notifications?agent=<name>&undelivered=true&taskId=<id>&limit=<n>
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const agent = String(req.query.agent || "");
    if (!agent) {
      return res.status(400).json({ error: 'agent query parameter required' });
    }

    const service = getNotificationService();
    const notifications = await service.getNotifications({
      agent,
      undelivered: req.query.undelivered === 'true',
      taskId: String(req.query.taskId || ""),
      limit: req.query.limit ? Number(String(req.query.limit)) : undefined,
    });

    res.json(notifications);
  })
);

/**
 * GET /api/notifications/stats
 */
router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const service = getNotificationService();
    const stats = await service.getStats();
    res.json(stats);
  })
);

/**
 * GET /api/notifications/subscriptions/:taskId
 */
router.get(
  '/subscriptions/:taskId',
  asyncHandler(async (req, res) => {
    const service = getNotificationService();
    const subs = await service.getSubscriptions(String(req.params.taskId));
    res.json(subs);
  })
);

/**
 * POST /api/notifications/process
 * Process a comment for @mentions and create notifications
 */
router.post(
  '/process',
  asyncHandler(async (req, res) => {
    const schema = z.object({
      taskId: z.string().min(1),
      fromAgent: z.string().min(1),
      content: z.string().min(1),
      allAgents: z.array(z.string()).optional(),
    });

    const data = schema.parse(req.body);
    const service = getNotificationService();
    const notifications = await service.processComment(data);
    res.status(201).json(notifications);
  })
);

/**
 * POST /api/notifications/:id/delivered
 */
router.post(
  '/:id/delivered',
  asyncHandler(async (req, res) => {
    const service = getNotificationService();
    const success = await service.markDelivered(String(req.params.id));
    if (!success) throw new NotFoundError('Notification not found');
    res.json({ success: true });
  })
);

/**
 * POST /api/notifications/delivered-all
 * Mark all notifications delivered for an agent
 */
router.post(
  '/delivered-all',
  asyncHandler(async (req, res) => {
    const schema = z.object({ agent: z.string().min(1) });
    const { agent } = schema.parse(req.body);
    const service = getNotificationService();
    const count = await service.markAllDelivered(agent);
    res.json({ success: true, count });
  })
);

export { router as notificationRoutes };
