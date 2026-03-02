/**
 * API Router Aggregation
 * Mounts all v1 API route groups
 */

import { Router } from 'express';
import { auditLogMiddleware } from './middleware/auditLog.js';
import { requireAuth } from './middleware/auth.js';
import aiFeedbackRouter from './routes/ai-feedback.js';
import auditLogRouter from './routes/auditLog.js';
import authRouter from './routes/auth.js';
import communityRouter from './routes/community.js';
import configRouter from './routes/config.js';
import conversationsRouter from './routes/conversations.js';
import guildsRouter from './routes/guilds.js';
import healthRouter from './routes/health.js';
import membersRouter from './routes/members.js';
import moderationRouter from './routes/moderation.js';
import notificationsRouter from './routes/notifications.js';
import ticketsRouter from './routes/tickets.js';
import webhooksRouter from './routes/webhooks.js';
import performanceRouter from './routes/performance.js';

const router = Router();

// Health check — public (no auth required)
router.use('/health', healthRouter);

// Community routes — public (no auth required, rate-limited)
router.use('/community', communityRouter);

// Auth routes — public (no auth required)
router.use('/auth', authRouter);

// Global config routes — require API secret or OAuth2 JWT
router.use('/config', requireAuth(), auditLogMiddleware(), configRouter);

// Member management routes — require API secret or OAuth2 JWT
// (mounted before guilds to handle /:id/members/* before the basic guilds endpoint)
router.use('/guilds', requireAuth(), auditLogMiddleware(), membersRouter);

// AI Feedback routes — require API secret or OAuth2 JWT
router.use('/guilds/:id/ai-feedback', requireAuth(), auditLogMiddleware(), aiFeedbackRouter);

// Conversation routes — require API secret or OAuth2 JWT
// (mounted before guilds to handle /:id/conversations/* before the catch-all guild endpoint)
router.use('/guilds/:id/conversations', requireAuth(), auditLogMiddleware(), conversationsRouter);

// Ticket routes — require API secret or OAuth2 JWT
// (mounted before guilds to handle /:id/tickets/* before the catch-all guild endpoint)
router.use('/guilds', requireAuth(), auditLogMiddleware(), ticketsRouter);

// Guild routes — require API secret or OAuth2 JWT
router.use('/guilds', requireAuth(), auditLogMiddleware(), guildsRouter);

// Moderation routes — require API secret or OAuth2 JWT
router.use('/moderation', requireAuth(), auditLogMiddleware(), moderationRouter);

// Audit log routes — require API secret or OAuth2 JWT
// GET-only; no audit middleware needed (reads are not mutating actions)
router.use('/guilds', requireAuth(), auditLogRouter);

// Performance metrics — require x-api-secret (authenticated via route handler)
router.use('/performance', performanceRouter);

// Notification webhook management routes — require API secret or OAuth2 JWT
router.use('/guilds', requireAuth(), auditLogMiddleware(), notificationsRouter);

// Webhook routes — require API secret or OAuth2 JWT (endpoint further restricts to api-secret)
router.use('/webhooks', requireAuth(), webhooksRouter);

export default router;

