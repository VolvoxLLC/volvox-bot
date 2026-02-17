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

  // Body parsing
  app.use(express.json());

  // CORS
  const dashboardUrl = process.env.DASHBOARD_URL;
  app.use((req, res, next) => {
    if (dashboardUrl) {
      res.set('Access-Control-Allow-Origin', dashboardUrl);
      res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-secret');
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
    }
    next();
  });

  // Rate limiting
  app.use(rateLimit());

  // Mount API routes under /api/v1
  app.use('/api/v1', apiRouter);

  // Error handling middleware
  app.use((err, _req, res, _next) => {
    error('Unhandled API error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
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
  const port = portEnv != null ? Number.parseInt(portEnv, 10) : 3001;

  return new Promise((resolve, reject) => {
    server = app.listen(port, () => {
      info('API server started', { port });
      resolve(server);
    });
    server.on('error', (err) => {
      error('API server failed to start', { error: err.message });
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
  if (!server) {
    warn('API server stop called but no server running');
    return;
  }

  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        error('Error closing API server', { error: err.message });
        reject(err);
      } else {
        info('API server stopped');
        server = null;
        resolve();
      }
    });
  });
}
