/**
 * Express API Server
 * HTTP server that runs alongside the Discord WebSocket client
 */

import express from 'express';
import { error, info, warn } from '../logger.js';
import apiRouter from './index.js';
import { PerformanceMonitor } from '../modules/performanceMonitor.js';
import { rateLimit } from './middleware/rateLimit.js';
import { stopAuthCleanup } from './routes/auth.js';
import { swaggerSpec } from './swagger.js';
import { stopGuildCacheCleanup } from './utils/discordApi.js';
import { setupAuditStream, stopAuditStream } from './ws/auditStream.js';
import { setupLogStream, stopLogStream } from './ws/logStream.js';

/** @type {import('node:http').Server | null} */
let server = null;

/** @type {ReturnType<typeof rateLimit> | null} */
let rateLimiter = null;

/**
 * Creates and configures the Express application.
 *
 * @param {import('discord.js').Client} client - Discord client instance
 * @param {import('pg').Pool | null} dbPool - PostgreSQL connection pool
 * @returns {import('express').Application} Configured Express app
 */
export function createApp(client, dbPool) {
  const app = express();

  // Trust one proxy hop (e.g. Railway, Docker) so req.ip reflects the real client IP
  app.set('trust proxy', 1);

  // Store references for route handlers
  app.locals.client = client;
  app.locals.dbPool = dbPool;

  // CORS - must come BEFORE body parser so error responses include CORS headers
  const dashboardUrl = process.env.DASHBOARD_URL;
  if (dashboardUrl === '*') {
    warn('DASHBOARD_URL is set to wildcard "*" — this is insecure; set a specific origin');
  }
  app.use((req, res, next) => {
    if (!dashboardUrl) return next();
    res.set('Access-Control-Allow-Origin', dashboardUrl);
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-secret, Authorization');
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  // Body parsing
  const bodyLimit = process.env.API_BODY_LIMIT || '100kb';
  app.use(express.json({ limit: bodyLimit }));

  // Rate limiting — destroy any leaked limiter from a prior createApp call
  if (rateLimiter) {
    rateLimiter.destroy();
    rateLimiter = null;
  }
  rateLimiter = rateLimit();
  app.use(rateLimiter);

  // Raw OpenAPI spec (JSON) — public for Mintlify
  app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

  // Response time tracking for performance monitoring
  app.use('/api/v1', (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const label = `${req.method} ${req.path}`;
      PerformanceMonitor.getInstance().recordResponseTime(label, duration, 'api');
    });
    next();
  });

  // Mount API routes under /api/v1
  app.use('/api/v1', apiRouter);

  // Error handling middleware
  app.use((err, _req, res, _next) => {
    // Pass through status code from body-parser or other middleware (e.g., 400 for malformed JSON)
    // Only use err.status/err.statusCode if it's a valid 4xx client error code
    // Otherwise default to 500 for server errors
    const statusCode = err.status ?? err.statusCode;
    const status = statusCode >= 400 && statusCode < 500 ? statusCode : 500;

    // Only log stack trace for server errors (5xx), not client errors (4xx)
    const logMeta = { error: err.message };
    if (!statusCode || statusCode >= 500) logMeta.stack = err.stack;
    error('Unhandled API error', logMeta);

    res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
  });

  return app;
}

/**
 * Starts the Express HTTP server.
 *
 * @param {import('discord.js').Client} client - Discord client instance
 * @param {import('pg').Pool | null} dbPool - PostgreSQL connection pool
 * @param {Object} [options] - Additional options
 * @param {import('../transports/websocket.js').WebSocketTransport} [options.wsTransport] - WebSocket transport for log streaming
 * @returns {Promise<import('node:http').Server>} The HTTP server instance
 */
export async function startServer(client, dbPool, options = {}) {
  if (server) {
    warn('startServer called while a server is already running — closing orphaned server');
    await stopServer();
  }

  const app = createApp(client, dbPool);
  const portEnv = process.env.BOT_API_PORT;
  const parsed = portEnv != null ? Number.parseInt(portEnv, 10) : NaN;
  const isValidPort = !Number.isNaN(parsed) && parsed >= 0 && parsed <= 65535;
  if (portEnv != null && !isValidPort) {
    warn('Invalid BOT_API_PORT value, falling back to default', {
      provided: portEnv,
      parsed,
      fallback: 3001,
    });
  }
  const port = isValidPort ? parsed : 3001;

  return new Promise((resolve, reject) => {
    server = app.listen(port, () => {
      info('API server started', { port });

      // Attach WebSocket log stream if transport provided
      if (options.wsTransport) {
        try {
          setupLogStream(server, options.wsTransport);
        } catch (err) {
          error('Failed to setup WebSocket log stream', { error: err.message });
          // Non-fatal — HTTP server still works without WS streaming
        }
      }

      // Attach audit log real-time WebSocket stream
      try {
        setupAuditStream(server);
      } catch (err) {
        error('Failed to setup audit log WebSocket stream', { error: err.message });
        // Non-fatal — HTTP server still works without audit WS streaming
      }

      resolve(server);
    });
    server.once('error', (err) => {
      error('API server failed to start', { error: err.message });
      server = null;
      reject(err);
    });
  });
}

/**
 * Stops the Express HTTP server gracefully.
 *
 * @returns {Promise<void>}
 */
export async function stopServer() {
  // Stop WebSocket log stream before closing HTTP server
  await stopLogStream();

  // Stop audit log WebSocket stream
  await stopAuditStream();

  stopAuthCleanup();
  stopGuildCacheCleanup();

  if (rateLimiter) {
    rateLimiter.destroy();
    rateLimiter = null;
  }

  if (!server) {
    warn('API server stop called but no server running');
    return;
  }

  const SHUTDOWN_TIMEOUT_MS = 5_000;
  const closing = server;

  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      warn('API server close timed out, forcing connections closed');
      if (typeof closing.closeAllConnections === 'function') {
        closing.closeAllConnections();
      }
      server = null;
      resolve();
    }, SHUTDOWN_TIMEOUT_MS);

    closing.close((err) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      server = null;
      if (err) {
        error('Error closing API server', { error: err.message });
        reject(err);
      } else {
        info('API server stopped');
        resolve();
      }
    });
  });
}
