/**
 * Audit Log Routes
 *
 * Admin-only endpoints for viewing and verifying the immutable audit log.
 */
import { Router, type IRouter } from 'express';
import { asyncHandler } from '../middleware/async-handler.js';
import { authenticate, authorize, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  readRecentAuditEntries,
  verifyAuditLog,
  getCurrentAuditLogPath,
} from '../services/audit-service.js';

const router: IRouter = Router();

/**
 * GET /api/v1/audit
 * Returns recent audit entries (newest first).
 * Query: ?limit=N (default 100, max 1000)
 */
router.get(
  '/',
  authenticate,
  authorize('admin'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limitParam = parseInt(req.query.limit as string, 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 100;

    const entries = await readRecentAuditEntries(limit);
    res.json({ entries, count: entries.length });
  })
);

/**
 * GET /api/v1/audit/verify
 * Verify the hash chain integrity of the current month's audit log.
 */
router.get(
  '/verify',
  authenticate,
  authorize('admin'),
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const filePath = getCurrentAuditLogPath();
    const result = await verifyAuditLog(filePath);
    res.json(result);
  })
);

export default router;
