/**
 * Error Event Handlers
 * Handles Discord client errors and process-level error handling
 */

import { Events } from 'discord.js';
import { error as logError } from '../../logger.js';

/** @type {boolean} Guard against duplicate process-level handler registration */
let processHandlersRegistered = false;

/**
 * Register error event handlers
 * @param {Client} client - Discord client
 */
export function registerErrorHandlers(client) {
  client.on(Events.Error, (err) => {
    logError('Discord error', { error: err.message, stack: err.stack });
  });

  if (!processHandlersRegistered) {
    process.on('unhandledRejection', (err) => {
      logError('Unhandled rejection', { error: err?.message || String(err), stack: err?.stack });
    });
    process.on('uncaughtException', async (err) => {
      logError('Uncaught exception — shutting down', {
        error: err?.message || String(err),
        stack: err?.stack,
      });
      try {
        const { Sentry } = await import('../../sentry.js');
        await Sentry.flush(2000);
      } catch {
        // ignore — best-effort flush
      }
      process.exit(1);
    });
    processHandlersRegistered = true;
  }
}
