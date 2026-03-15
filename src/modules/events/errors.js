/**
 * Error Event Handlers
 * Handles Discord client errors, shard disconnects, and process-level error handling.
 */

import { Events } from 'discord.js';
import { error as logError, warn as logWarn } from '../../logger.js';

/** @type {boolean} Guard against duplicate process-level handler registration */
let processHandlersRegistered = false;

/**
 * Register error event handlers
 * @param {import('discord.js').Client} client - Discord client
 */
export function registerErrorHandlers(client) {
  client.on(Events.Error, (err) => {
    logError('Discord client error', {
      error: err.message,
      stack: err.stack,
      code: err.code,
      source: 'discord_client',
    });
  });

  client.on(Events.ShardDisconnect, (event, shardId) => {
    if (event.code !== 1000) {
      logWarn('Shard disconnected unexpectedly', {
        shardId,
        code: event.code,
        source: 'discord_shard',
      });
    }
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
