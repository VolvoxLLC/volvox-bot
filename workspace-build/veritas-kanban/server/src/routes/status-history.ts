import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler.js';
import { ValidationError } from '../middleware/error-handler.js';
import { authorize } from '../middleware/auth.js';
import { statusHistoryService } from '../services/status-history-service.js';

const router: RouterType = Router();

// GET /api/status-history - Get status change history
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const history = await statusHistoryService.getHistory(limit, offset);
    res.json(history);
  })
);

// GET /api/status-history/summary/daily - Get daily summary
router.get(
  '/summary/daily',
  asyncHandler(async (req, res) => {
    const date = req.query.date as string | undefined;

    // Validate date format if provided
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new ValidationError('Invalid date format. Use YYYY-MM-DD', {});
    }

    const summary = await statusHistoryService.getDailySummary(date);
    res.json(summary);
  })
);

// GET /api/status-history/summary/weekly - Get weekly summary (last 7 days)
router.get(
  '/summary/weekly',
  asyncHandler(async (_req, res) => {
    const summaries = await statusHistoryService.getWeeklySummary();
    res.json(summaries);
  })
);

// GET /api/status-history/range - Get history by date range
router.get(
  '/range',
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      throw new ValidationError('startDate and endDate are required', {});
    }

    const entries = await statusHistoryService.getHistoryByDateRange(
      startDate as string,
      endDate as string
    );
    res.json(entries);
  })
);

// DELETE /api/status-history - Clear all history
router.delete(
  '/',
  authorize('admin'),
  asyncHandler(async (_req, res) => {
    await statusHistoryService.clearHistory();
    res.status(204).send();
  })
);

export { router as statusHistoryRoutes };
