/**
 * Guild Member Add Event Handler
 * Handles welcome messages when users join a guild
 */

import { Events } from 'discord.js';
import { getConfig } from '../config.js';
import { sendWelcomeMessage } from '../welcome.js';

/**
 * Register a handler that sends the configured welcome message when a user joins a guild.
 * @param {Client} client - Discord client instance to attach the event listener to.
 * @param {Object} _config - Unused (kept for API compatibility); handler resolves per-guild config via getConfig().
 */
export function registerGuildMemberAddHandler(client, _config) {
  client.on(Events.GuildMemberAdd, async (member) => {
    const guildConfig = getConfig(member.guild.id);
    await sendWelcomeMessage(member, client, guildConfig);
  });
}
