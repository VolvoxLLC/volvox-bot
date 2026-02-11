/**
 * Events Module
 * Handles Discord event listeners and handlers
 */

import { Events } from 'discord.js';
import { info, error as logError, warn } from '../logger.js';
import { needsSplitting, splitMessage } from '../utils/splitMessage.js';
import { generateResponse } from './ai.js';
import { accumulate, resetCounter } from './chimeIn.js';
import { isSpam, sendSpamAlert } from './spam.js';
import { recordCommunityActivity, sendWelcomeMessage } from './welcome.js';

/** @type {boolean} Guard against duplicate process-level handler registration */
let processHandlersRegistered = false;

/**
 * Register bot ready event handler
 * @param {Object} client - Discord client
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
 * @param {Object} client - Discord client
 * @param {Object} config - Bot configuration
 */
export function registerGuildMemberAddHandler(client, config) {
  client.on('guildMemberAdd', async (member) => {
    await sendWelcomeMessage(member, client, config);
  });
}

/**
 * Register message create event handler
 * @param {Object} client - Discord client
 * @param {Object} config - Bot configuration
 * @param {Object} healthMonitor - Health monitor instance
 */
export function registerMessageCreateHandler(client, config, healthMonitor) {
  client.on('messageCreate', async (message) => {
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
      const allowedChannels = config.ai?.channels || [];
      const isAllowedChannel =
        allowedChannels.length === 0 || allowedChannels.includes(message.channel.id);

      if ((isMentioned || isReply) && isAllowedChannel) {
        // Reset chime-in counter so we don't double-respond
        resetCounter(message.channel.id);

        // Remove the mention from the message
        const cleanContent = message.content
          .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
          .trim();

        if (!cleanContent) {
          await message.reply("Hey! What's up?");
          return;
        }

        await message.channel.sendTyping();

        const response = await generateResponse(
          message.channel.id,
          cleanContent,
          message.author.username,
          config,
          healthMonitor,
        );

        // Split long responses
        if (needsSplitting(response)) {
          const chunks = splitMessage(response);
          for (const chunk of chunks) {
            await message.channel.send(chunk);
          }
        } else {
          await message.reply(response);
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
 * @param {Object} client - Discord client
 */
export function registerErrorHandlers(client) {
  client.on('error', (err) => {
    logError('Discord error', { error: err.message, stack: err.stack });
  });

  if (!processHandlersRegistered) {
    process.on('unhandledRejection', (err) => {
      logError('Unhandled rejection', { error: err?.message, stack: err?.stack });
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
