import { Router, type Router as RouterType } from 'express';
import { getTraceService } from '../services/trace-service.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { NotFoundError } from '../middleware/error-handler.js';

const router: RouterType = Router();

/**
 * GET /api/traces/status
 * Get tracing status (enabled/disabled)
 */
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const traceService = getTraceService();
    res.json({
      enabled: traceService.isEnabled(),
    });
  })
);

/**
 * POST /api/traces/enable
 * Enable tracing
 */
router.post(
  '/enable',
  asyncHandler(async (_req, res) => {
    const traceService = getTraceService();
    traceService.setEnabled(true);
    res.json({ enabled: true });
  })
);

/**
 * POST /api/traces/disable
 * Disable tracing
 */
router.post(
  '/disable',
  asyncHandler(async (_req, res) => {
    const traceService = getTraceService();
    traceService.setEnabled(false);
    res.json({ enabled: false });
  })
);

/**
 * GET /api/traces/:attemptId
 * Get a trace by attempt ID
 */
router.get(
  '/:attemptId',
  asyncHandler(async (req, res) => {
    const traceService = getTraceService();
    const trace = await traceService.getTrace(req.params.attemptId as string);

    if (!trace) {
      throw new NotFoundError('Trace not found');
    }

    res.json(trace);
  })
);

/**
 * GET /api/traces/task/:taskId
 * List all traces for a task
 */
router.get(
  '/task/:taskId',
  asyncHandler(async (req, res) => {
    const traceService = getTraceService();
    const traces = await traceService.listTraces(req.params.taskId as string);
    res.json(traces);
  })
);

export default router;
