/**
 * Events Module
 * Handles Discord event listeners and handlers
 */

import { Client, Events } from 'discord.js';
import { info, error as logError, warn } from '../logger.js';
import { getUserFriendlyMessage } from '../utils/errors.js';
// safeReply works with both Interactions (.reply()) and Messages (.reply()).
// Both accept the same options shape including allowedMentions, so the
// safe wrapper applies identically to either target type.
import { safeReply } from '../utils/safeSend.js';
import { isSpam, sendSpamAlert } from './spam.js';
import { accumulateMessage, evaluateNow } from './triage.js';
import { recordCommunityActivity, sendWelcomeMessage } from './welcome.js';

/** @type {boolean} Guard against duplicate process-level handler registration */
let processHandlersRegistered = false;

/**
 * Register a one-time handler that runs when the Discord client becomes ready.
 *
 * When fired, the handler logs the bot's online status and server count, records
 * start time with the provided health monitor (if any), and logs which features
 * are enabled (welcome messages with channel ID, AI triage model selection, and moderation).
 *
 * @param {Client} client - The Discord client instance.
 * @param {Object} config - Bot configuration object (may include `welcome`, `ai`, `triage`, and `moderation` settings).
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
      const triageModel = config.triage?.models?.default ?? 'claude-sonnet-4-5';
      info('AI chat enabled', { model: triageModel });
    }
    if (config.moderation?.enabled) {
      info('Moderation enabled');
    }
  });
}

/**
 * Register a handler that sends the configured welcome message when a user joins a guild.
 * @param {Client} client - Discord client instance to attach the event listener to.
 * @param {Object} config - Bot configuration containing welcome settings.
 */
export function registerGuildMemberAddHandler(client, config) {
  client.on(Events.GuildMemberAdd, async (member) => {
    await sendWelcomeMessage(member, client, config);
  });
}

/**
 * Register the MessageCreate event handler that processes incoming messages
 * for spam detection, community activity recording, and triage-based AI routing.
 *
 * Flow:
 * 1. Ignore bots/DMs
 * 2. Spam detection
 * 3. Community activity tracking
 * 4. @mention/reply → evaluateNow (triage classifies + responds internally)
 * 5. Otherwise → accumulateMessage (buffer for periodic triage eval)
 *
 * @param {Client} client - Discord client instance
 * @param {Object} config - Bot configuration
 * @param {Object} healthMonitor - Optional health monitor for metrics
 */
export function registerMessageCreateHandler(client, config, healthMonitor) {
  client.on(Events.MessageCreate, async (message) => {
    // Ignore bots and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    // Spam detection
    if (config.moderation?.enabled && isSpam(message.content)) {
      warn('Spam detected', { userId: message.author.id, contentPreview: '[redacted]' });
      await sendSpamAlert(message, client, config);
      return;
    }

    // Feed welcome-context activity tracker
    recordCommunityActivity(message, config);

    // AI chat — @mention or reply to bot → instant triage evaluation
    if (config.ai?.enabled) {
      const isMentioned = message.mentions.has(client.user);
      const isReply = message.reference && message.mentions.repliedUser?.id === client.user.id;

      // Check if in allowed channel (if configured)
      // When inside a thread, check the parent channel ID against the allowlist
      // so thread replies aren't blocked by the whitelist.
      const allowedChannels = config.ai?.channels || [];
      const channelIdToCheck = message.channel.isThread?.()
        ? message.channel.parentId
        : message.channel.id;
      const isAllowedChannel =
        allowedChannels.length === 0 || allowedChannels.includes(channelIdToCheck);

      if ((isMentioned || isReply) && isAllowedChannel) {
        // Remove the mention from the message
        const cleanContent = message.content
          .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
          .trim();

        if (!cleanContent) {
          try {
            await safeReply(message, "Hey! What's up?");
          } catch {
            // Channel unreachable
          }
          return;
        }

        // Accumulate the message into the triage buffer first (for context)
        accumulateMessage(message, config);

        // Force immediate triage evaluation — triage owns the full response lifecycle
        try {
          await evaluateNow(message.channel.id, config, client, healthMonitor);
        } catch (err) {
          logError('Triage evaluation failed for mention', {
            channelId: message.channel.id,
            error: err.message,
          });
          try {
            await safeReply(message, getUserFriendlyMessage(err));
          } catch {
            // Channel unreachable
          }
        }

        return; // Don't accumulate again below
      }
    }

    // Triage: accumulate message for periodic evaluation (fire-and-forget)
    try {
      accumulateMessage(message, config);
    } catch (err) {
      logError('Triage accumulate error', { error: err?.message });
    }
  });
}

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
    processHandlersRegistered = true;
  }
}

/**
 * Register all event handlers
 * @param {Object} client - Discord client
 * @param {Object} config - Bot configuration
 * @param {Object} healthMonitor - Health monitor instance
 */
export function registerEventHandlers(client, config, healthMonitor) {
  registerReadyHandler(client, config, healthMonitor);
  registerGuildMemberAddHandler(client, config);
  registerMessageCreateHandler(client, config, healthMonitor);
  registerErrorHandlers(client);
}