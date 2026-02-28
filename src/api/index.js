/**
 * API Router Aggregation
 * Mounts all v1 API route groups
 */

import { Router } from 'express';
import { auditLogMiddleware } from './middleware/auditLog.js';
import { requireAuth } from './middleware/auth.js';
import auditLogRouter from './routes/auditLog.js';
import authRouter from './routes/auth.js';
import communityRouter from './routes/community.js';
import configRouter from './routes/config.js';
import conversationsRouter from './routes/conversations.js';
import guildsRouter from './routes/guilds.js';
import healthRouter from './routes/health.js';
import membersRouter from './routes/members.js';
import moderationRouter from './routes/moderation.js';
import ticketsRouter from './routes/tickets.js';
import webhooksRouter from './routes/webhooks.js';

const router = Router();

// Health check — public (no auth required)
router.use('/health', healthRouter);

// Community routes — public (no auth required, rate-limited)
router.use('/community', communityRouter);

// Auth routes — public (no auth required)
router.use('/auth', authRouter);

// Global config routes — require API secret or OAuth2 JWT
router.use('/config', requireAuth(), configRouter);

// Member management routes — require API secret or OAuth2 JWT
// (mounted before guilds to handle /:id/members/* before the basic guilds endpoint)
router.use('/guilds', requireAuth(), membersRouter);

// Conversation routes — require API secret or OAuth2 JWT
// (mounted before guilds to handle /:id/conversations/* before the catch-all guild endpoint)
router.use('/guilds/:id/conversations', requireAuth(), conversationsRouter);

// Ticket routes — require API secret or OAuth2 JWT
// (mounted before guilds to handle /:id/tickets/* before the catch-all guild endpoint)
router.use('/guilds', requireAuth(), ticketsRouter);

// Guild routes — require API secret or OAuth2 JWT
router.use('/guilds', requireAuth(), guildsRouter);

// Moderation routes — require API secret or OAuth2 JWT
router.use('/moderation', requireAuth(), moderationRouter);

// Audit log routes — require API secret or OAuth2 JWT
// (mounted before guilds catch-all to handle /:id/audit-log)
router.use('/guilds', requireAuth(), auditLogRouter);

// Webhook routes — require API secret or OAuth2 JWT (endpoint further restricts to api-secret)
router.use('/webhooks', requireAuth(), webhooksRouter);

// Audit log middleware — records all mutating authenticated requests.
// Applied after all route mounts so it captures POST/PUT/PATCH/DELETE on all routes above.
router.use(auditLogMiddleware());

export default router;
