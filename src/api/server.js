/**
 * Express API Server
 * HTTP server that runs alongside the Discord WebSocket client
 */

import express from 'express';
import { error, info, warn } from '../logger.js';
import apiRouter from './index.js';
import { rateLimit } from './middleware/rateLimit.js';

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

  // Store references for route handlers
  app.locals.client = client;
  app.locals.dbPool = dbPool;

  // CORS - must come BEFORE body parser so error responses include CORS headers
  const dashboardUrl = process.env.DASHBOARD_URL;
  app.use((req, res, next) => {
    if (!dashboardUrl) return next();
    res.set('Access-Control-Allow-Origin', dashboardUrl);
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-secret');
      return res.status(204).end();
    }
    next();
  });

  // Body parsing
  app.use(express.json());

  // Rate limiting — destroy any leaked limiter from a prior createApp call
  if (rateLimiter) {
    rateLimiter.destroy();
    rateLimiter = null;
  }
  rateLimiter = rateLimit();
  app.use(rateLimiter);

  // Mount API routes under /api/v1
  app.use('/api/v1', apiRouter);

  // Error handling middleware
  app.use((err, _req, res, _next) => {
    error('Unhandled API error', { error: err.message, stack: err.stack });
    // Pass through status code from body-parser or other middleware (e.g., 400 for malformed JSON)
    // Only use err.status/err.statusCode if it's a valid 4xx client error code
    // Otherwise default to 500 for server errors
    const statusCode = err.status ?? err.statusCode;
    const status = statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    res.status(status).json({ error: status < 500 ? err.message : 'Internal server error' });
  });

  return app;
}

/**
 * Starts the Express HTTP server.
 *
 * @param {import('discord.js').Client} client - Discord client instance
 * @param {import('pg').Pool | null} dbPool - PostgreSQL connection pool
 * @returns {Promise<import('node:http').Server>} The HTTP server instance
 */
export async function startServer(client, dbPool) {
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
    const timeout = setTimeout(() => {
      warn('API server close timed out, forcing connections closed');
      if (typeof closing.closeAllConnections === 'function') {
        closing.closeAllConnections();
      }
    }, SHUTDOWN_TIMEOUT_MS);

    closing.close((err) => {
      clearTimeout(timeout);
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
