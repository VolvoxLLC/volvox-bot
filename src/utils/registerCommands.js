/**
 * Command registration utilities for Bill Bot
 *
 * Handles registering slash commands with Discord's API
 */

import { REST, Routes } from 'discord.js';

/**
 * Register slash commands with Discord
 *
 * @param {Array} commands - Array of command modules with .data property
 * @param {string} clientId - Discord application/client ID
 * @param {string} token - Discord bot token
 * @param {string} [guildId] - Optional guild ID for guild-specific registration (faster for dev)
 * @returns {Promise<void>}
 */
export async function registerCommands(commands, clientId, token, guildId = null) {
  if (!commands || !Array.isArray(commands)) {
    throw new Error('Commands must be an array');
  }

  if (!clientId || !token) {
    throw new Error('Client ID and token are required');
  }

  // Convert command modules to JSON for API
  const commandData = commands.map(cmd => {
    if (!cmd.data || typeof cmd.data.toJSON !== 'function') {
      throw new Error('Each command must have a .data property with toJSON() method');
    }
    return cmd.data.toJSON();
  });

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log(`🔄 Registering ${commandData.length} slash command(s)...`);

    let data;
    if (guildId) {
      // Guild-specific commands (instant updates, good for development)
      data = await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandData }
      );
    } else {
      // Global commands (can take up to 1 hour to update)
      data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandData }
      );
    }

    console.log(`✅ Successfully registered ${data.length} slash command(s)${guildId ? ' (guild)' : ' (global)'}`);
  } catch (err) {
    console.error('❌ Failed to register commands:', err.message);
    throw err;
  }
}
