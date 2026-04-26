/**
 * Ready Event Handler
 * Handles Discord client ready event
 */

import { Events } from 'discord.js';
import { info } from '../../logger.js';
import { resolveTriageConfig } from '../triage-config.js';

/**
 * Register a one-time handler that runs when the Discord client becomes ready.
 *
 * When fired, the handler logs the bot's online status and server count, records
 * start time with the provided health monitor (if any), and logs which features
 * are enabled (welcome messages with channel ID, AI triage model selection, and moderation).
 *
 * @param {Client} client - The Discord client instance.
 * @param {Object} config - Startup/global bot configuration used only for one-time feature-gate logging (not per-guild).
 * @param {Object} [healthMonitor] - Optional health monitor with a `recordStart` method to mark service start time.
 */
export function registerReadyHandler(client, config, healthMonitor) {
  client.once(Events.ClientReady, () => {
    info(`${client.user.tag} is online`, { servers: client.guilds.cache.size });

    // Record bot start time
    if (healthMonitor) {
      healthMonitor.recordStart();
    }

    if (config.welcome?.enabled) {
      info('Welcome messages enabled', { channelId: config.welcome.channelId });
    }
    if (config.ai?.enabled) {
      // Reuse the canonical resolver so fallback precedence stays in sync with
      // the triage runtime (see src/modules/triage-config.js).
      const resolved = resolveTriageConfig(config.triage || {});
      info('AI chat enabled', {
        classifyModel: resolved.classifyModel,
        respondModel: resolved.respondModel,
      });
    }
    if (config.moderation?.enabled) {
      info('Moderation enabled');
    }
    if (config.starboard?.enabled) {
      info('Starboard enabled', {
        channelId: config.starboard.channelId,
        threshold: config.starboard.threshold,
      });
    }
  });
}
