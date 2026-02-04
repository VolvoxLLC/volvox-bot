/**
 * Events Module
 * Handles Discord event listeners and handlers
 */

import { sendWelcomeMessage } from './welcome.js';
import { isSpam, sendSpamAlert } from './spam.js';
import { generateResponse } from './ai.js';

/**
 * Register bot ready event handler
 * @param {Object} client - Discord client
 * @param {Object} config - Bot configuration
 * @param {Object} healthMonitor - Health monitor instance
 */
export function registerReadyHandler(client, config, healthMonitor) {
  client.once('ready', () => {
    console.log(`✅ ${client.user.tag} is online!`);
    console.log(`📡 Serving ${client.guilds.cache.size} server(s)`);

    // Record bot start time
    if (healthMonitor) {
      healthMonitor.recordStart();
    }

    if (config.welcome?.enabled) {
      console.log(`👋 Welcome messages → #${config.welcome.channelId}`);
    }
    if (config.ai?.enabled) {
      console.log(`🤖 AI chat enabled (${config.ai.model || 'claude-sonnet-4-20250514'})`);
    }
    if (config.moderation?.enabled) {
      console.log(`🛡️ Moderation enabled`);
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
      console.log(`[SPAM] ${message.author.tag}: ${message.content.slice(0, 50)}...`);
      await sendSpamAlert(message, client, config);
      return;
    }

    // AI chat - respond when mentioned
    if (config.ai?.enabled) {
      const isMentioned = message.mentions.has(client.user);
      const isReply = message.reference && message.mentions.repliedUser?.id === client.user.id;

      // Check if in allowed channel (if configured)
      const allowedChannels = config.ai?.channels || [];
      const isAllowedChannel = allowedChannels.length === 0 || allowedChannels.includes(message.channel.id);

      if ((isMentioned || isReply) && isAllowedChannel) {
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
          healthMonitor
        );

        // Split long responses
        if (response.length > 2000) {
          const chunks = response.match(/[\s\S]{1,1990}/g) || [];
          for (const chunk of chunks) {
            await message.channel.send(chunk);
          }
        } else {
          await message.reply(response);
        }
      }
    }
  });
}

/**
 * Register error event handlers
 * @param {Object} client - Discord client
 */
export function registerErrorHandlers(client) {
  client.on('error', (error) => {
    console.error('Discord error:', error);
  });

  process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
  });
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
