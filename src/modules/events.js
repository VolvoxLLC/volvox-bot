/**
 * Events Module
 * Handles Discord event listeners and handlers
 */

import { Client, Events } from 'discord.js';
import { info, error as logError, warn } from '../logger.js';
import { getUserFriendlyMessage } from '../utils/errors.js';
import { needsSplitting, splitMessage } from '../utils/splitMessage.js';
import { generateResponse } from './ai.js';
import { accumulate, resetCounter } from './chimeIn.js';
import { isSpam, sendSpamAlert } from './spam.js';
import { getOrCreateThread, shouldUseThread } from './threading.js';
import { recordCommunityActivity, sendWelcomeMessage } from './welcome.js';

/** @type {boolean} Guard against duplicate process-level handler registration */
let processHandlersRegistered = false;

/**
 * Register bot ready event handler
 * @param {Client} client - Discord client
 * @param {Object} config - Bot configuration
 * @param {Object} healthMonitor - Health monitor instance
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
      info('AI chat enabled', { model: config.ai.model || 'claude-sonnet-4-20250514' });
    }
    if (config.moderation?.enabled) {
      info('Moderation enabled');
    }
  });
}

/**
 * Register guild member add event handler
 * @param {Client} client - Discord client
 * @param {Object} config - Bot configuration
 */
export function registerGuildMemberAddHandler(client, config) {
  client.on(Events.GuildMemberAdd, async (member) => {
    await sendWelcomeMessage(member, client, config);
  });
}

/**
 * Register the MessageCreate event handler that processes incoming messages for spam detection, community activity recording, AI-driven replies (mentions/replies, optional threading, channel whitelisting), and organic chime-in accumulation.
 * @param {Client} client - Discord client instance used to listen and respond to message events.
 * @param {Object} config - Bot configuration (reads moderation.enabled, ai.enabled, ai.channels and other settings referenced by handlers).
 * @param {Object} healthMonitor - Optional health monitor used when generating AI responses to record metrics.
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

    // AI chat - respond when mentioned (checked BEFORE accumulate to prevent double responses)
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
        // Reset chime-in counter so we don't double-respond
        resetCounter(message.channel.id);

        // Remove the mention from the message
        const cleanContent = message.content
          .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
          .trim();

        try {
          if (!cleanContent) {
            await message.reply("Hey! What's up?");
            return;
          }

          // Determine whether to use threading
          const useThread = shouldUseThread(message);
          let targetChannel = message.channel;

          if (useThread) {
            const { thread } = await getOrCreateThread(message, cleanContent);
            if (thread) {
              targetChannel = thread;
            }
            // If thread is null, fall back to inline reply (targetChannel stays as message.channel)
          }

          await targetChannel.sendTyping();

          // Use thread ID for conversation history when in a thread, otherwise channel ID
          const historyId = targetChannel.id;

          const response = await generateResponse(
            historyId,
            cleanContent,
            message.author.username,
            config,
            healthMonitor,
          );

          // Split long responses
          if (needsSplitting(response)) {
            const chunks = splitMessage(response);
            for (const chunk of chunks) {
              await targetChannel.send(chunk);
            }
          } else if (targetChannel === message.channel) {
            // Inline reply — use message.reply for the reference
            await message.reply(response);
          } else {
            // Thread reply — send directly to the thread
            await targetChannel.send(response);
          }
        } catch (sendErr) {
          logError('Failed to send AI response', {
            channelId: message.channel.id,
            error: sendErr.message,
          });
          // Best-effort fallback — if the channel is still reachable, let the user know
          try {
            await message.reply(getUserFriendlyMessage(sendErr));
          } catch {
            // Channel is unreachable — nothing more we can do
          }
        }

        return; // Don't accumulate direct mentions into chime-in buffer
      }
    }

    // Chime-in: accumulate message for organic participation (fire-and-forget)
    accumulate(message, config).catch((err) => {
      logError('ChimeIn accumulate error', { error: err?.message });
    });
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
