/**
 * Command Interaction Handler
 * Handles slash command dispatch and autocomplete interactions.
 */

import { Events } from 'discord.js';
import { debug, error, info, warn } from '../../logger.js';
import { logCommandUsage } from '../../utils/commandUsage.js';
import { getPermissionError, hasPermission } from '../../utils/permissions.js';
import { safeFollowUp, safeReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';

/**
 * Register the interactionCreate handler for slash commands and autocomplete.
 * @param {import('discord.js').Client} client - Discord client
 */
export function registerCommandInteractionHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    // Handle autocomplete
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) {
        await interaction.respond([]);
        return;
      }
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        error('Autocomplete error', {
          command: interaction.commandName,
          error: err instanceof Error ? err.message : String(err),
        });
        await interaction.respond([]);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName, member } = interaction;

    try {
      info('Slash command received', { command: commandName, user: interaction.user.tag });

      // Permission check
      const guildConfig = getConfig(interaction.guildId);
      if (!hasPermission(member, commandName, guildConfig)) {
        const permLevel =
          guildConfig.permissions?.allowedCommands?.[commandName] || 'administrator';
        await safeReply(interaction, {
          content: getPermissionError(commandName, permLevel),
          ephemeral: true,
        });
        warn('Permission denied', { user: interaction.user.tag, command: commandName });
        return;
      }

      // Execute command from collection
      const command = client.commands.get(commandName);
      if (!command) {
        await safeReply(interaction, {
          content: '❌ Command not found.',
          ephemeral: true,
        });
        return;
      }

      await command.execute(interaction);
      info('Command executed', {
        command: commandName,
        user: interaction.user.tag,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      // Log command usage to dedicated analytics table (fire-and-forget)
      logCommandUsage({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        commandName,
        channelId: interaction.channelId,
      }).catch((err) =>
        error('Failed to log command usage', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } catch (err) {
      error('Command error', {
        command: commandName,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        source: 'slash_command',
      });

      const errorMessage = {
        content: '❌ An error occurred while executing this command.',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await safeFollowUp(interaction, errorMessage).catch((replyErr) => {
          debug('Failed to send error follow-up', {
            error: replyErr.message,
            command: commandName,
          });
        });
      } else {
        await safeReply(interaction, errorMessage).catch((replyErr) => {
          debug('Failed to send error reply', { error: replyErr.message, command: commandName });
        });
      }
    }
  });
}
