/**
 * Performance Metrics Route
 *
 * Returns bot performance metrics including memory usage, CPU utilization,
 * response time statistics, and configurable alert thresholds.
 *
 * All endpoints require x-api-secret authentication.
 */

import { Router } from 'express';
import { PerformanceMonitor } from '../../modules/performanceMonitor.js';
import { isValidSecret } from '../middleware/auth.js';

const router = Router();

/**
 * @openapi
 * /performance:
 *   get:
 *     tags:
 *       - Performance
 *     summary: Get performance metrics snapshot
 *     description: >
 *       Returns the full performance snapshot including current stats,
 *       time-series data for memory/CPU, response time samples and summary,
 *       and configured alert thresholds. Requires x-api-secret header.
 *     parameters:
 *       - in: header
 *         name: x-api-secret
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       "200":
 *         description: Performance snapshot
 *       "401":
 *         description: Unauthorized
 */
router.get('/', (req, res) => {
  if (!isValidSecret(req.headers['x-api-secret'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const monitor = PerformanceMonitor.getInstance();
  const snapshot = monitor.getSnapshot();
  res.json(snapshot);
});

/**
 * @openapi
 * /performance/thresholds:
 *   get:
 *     tags:
 *       - Performance
 *     summary: Get alert thresholds
 *     security:
 *       - apiSecret: []
 *     responses:
 *       "200":
 *         description: Current thresholds
 *   put:
 *     tags:
 *       - Performance
 *     summary: Update alert thresholds
 *     description: Partial update — only supplied fields are changed.
 *     security:
 *       - apiSecret: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               memoryHeapMb:
 *                 type: number
 *               memoryRssMb:
 *                 type: number
 *               cpuPercent:
 *                 type: number
 *               responseTimeMs:
 *                 type: number
 *     responses:
 *       "200":
 *         description: Updated thresholds
 */
router.get('/thresholds', (req, res) => {
  if (!isValidSecret(req.headers['x-api-secret'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const monitor = PerformanceMonitor.getInstance();
  res.json(monitor.getThresholds());
});

router.put('/thresholds', (req, res) => {
  if (!isValidSecret(req.headers['x-api-secret'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const allowed = new Set(['memoryHeapMb', 'memoryRssMb', 'cpuPercent', 'responseTimeMs']);
  const update = {};

  for (const [key, val] of Object.entries(req.body ?? {})) {
    if (!allowed.has(key)) continue;
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) {
      return res.status(400).json({ error: `Invalid value for ${key}: must be a positive number` });
    }
    update[key] = num;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No valid threshold fields provided' });
  }

  const monitor = PerformanceMonitor.getInstance();
  monitor.setThresholds(update);
  res.json(monitor.getThresholds());
});

export default router;
