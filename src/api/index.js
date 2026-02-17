/**
 * API Router Aggregation
 * Mounts all v1 API route groups
 */

import { Router } from 'express';
import { requireAuth } from './middleware/auth.js';
import guildsRouter from './routes/guilds.js';
import healthRouter from './routes/health.js';

const router = Router();

// Health check — public (no auth required)
router.use('/health', healthRouter);

// Guild routes — require API secret
router.use('/guilds', requireAuth(), guildsRouter);

export default router;
