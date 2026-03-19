/**
 * ClientReady Event Handler
 * Registers slash commands with Discord once the client is ready.
 */

import { Events } from 'discord.js';
import logger from '../../logger.js';
import { registerCommands } from '../../utils/registerCommands.js';

/**
 * Register the ClientReady handler for slash command registration.
 * @param {import('discord.js').Client} client - Discord client
 */
export function registerClientReadyHandler(client) {
  client.once(Events.ClientReady, async () => {
    try {
      const commands = Array.from(client.commands.values());
      await registerCommands(commands, client.user.id, process.env.DISCORD_TOKEN);
    } catch (err) {
      logger.error('Command registration failed', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  });
}
