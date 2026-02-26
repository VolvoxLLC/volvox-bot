/**
 * API Router Aggregation
 * Mounts all v1 API route groups
 */

import { Router } from 'express';
import { requireAuth } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import configRouter from './routes/config.js';
import guildsRouter from './routes/guilds.js';
import healthRouter from './routes/health.js';
import moderationRouter from './routes/moderation.js';
import webhooksRouter from './routes/webhooks.js';

const router = Router();

// Health check — public (no auth required)
router.use('/health', healthRouter);

// Auth routes — public (no auth required)
router.use('/auth', authRouter);

// Global config routes — require API secret or OAuth2 JWT
router.use('/config', requireAuth(), configRouter);

// Guild routes — require API secret or OAuth2 JWT
router.use('/guilds', requireAuth(), guildsRouter);

// Moderation routes — require API secret or OAuth2 JWT
router.use('/moderation', requireAuth(), moderationRouter);

// Webhook routes — require API secret or OAuth2 JWT (endpoint further restricts to api-secret)
router.use('/webhooks', requireAuth(), webhooksRouter);

export default router;
