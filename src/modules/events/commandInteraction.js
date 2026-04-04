/**
 * Command Interaction Handler
 * Handles slash command dispatch and autocomplete interactions.
 */

import { Events } from 'discord.js';
import logger from '../../logger.js';
import { logCommandUsage } from '../../utils/commandUsage.js';
import { getPermissionError, hasPermission } from '../../utils/permissions.js';
import { safeFollowUp, safeReply } from '../../utils/safeSend.js';
import { getConfig } from '../config.js';

function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Handle autocomplete interactions.
 * @param {import('discord.js').Client} client - Discord client
 * @param {import('discord.js').AutocompleteInteraction} interaction - Autocomplete interaction
 */
async function handleAutocomplete(client, interaction) {
  const command = client.commands.get(interaction.commandName);
  if (!command?.autocomplete) {
    await interaction.respond([]);
    return;
  }

  try {
    await command.autocomplete(interaction);
  } catch (err) {
    logger.error('Autocomplete error', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      command: interaction.commandName,
      error: getErrorMessage(err),
    });
    await interaction.respond([]);
  }
}

/**
 * Send a safe command execution error response.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Command interaction
 * @param {string} commandName - Slash command name
 */
async function sendCommandExecutionError(interaction, commandName) {
  const errorMessage = {
    content: '❌ An error occurred while executing this command.',
    ephemeral: true,
  };

  if (interaction.replied || interaction.deferred) {
    await safeFollowUp(interaction, errorMessage).catch((replyErr) => {
      logger.debug('Failed to send error follow-up', {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        error: getErrorMessage(replyErr),
        command: commandName,
      });
    });
    return;
  }

  await safeReply(interaction, errorMessage).catch((replyErr) => {
    logger.debug('Failed to send error reply', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      error: getErrorMessage(replyErr),
      command: commandName,
    });
  });
}

/**
 * Register the interactionCreate handler for slash commands and autocomplete.
 * @param {import('discord.js').Client} client - Discord client
 */
export function registerCommandInteractionHandler(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(client, interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName, member } = interaction;

    try {
      logger.info('Slash command received', {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        command: commandName,
        user: interaction.user.tag,
      });

      const guildConfig = getConfig(interaction.guildId);
      if (!hasPermission(member, commandName, guildConfig)) {
        const permLevel =
          guildConfig.permissions?.allowedCommands?.[commandName] || 'administrator';
        await safeReply(interaction, {
          content: getPermissionError(commandName, permLevel),
          ephemeral: true,
        });
        logger.warn('Permission denied', {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          user: interaction.user.tag,
          command: commandName,
        });
        return;
      }

      const command = client.commands.get(commandName);
      if (!command) {
        await safeReply(interaction, {
          content: '❌ Command not found.',
          ephemeral: true,
        });
        return;
      }

      await command.execute(interaction);
      logger.info('Command executed', {
        command: commandName,
        user: interaction.user.tag,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
      });

      void logCommandUsage({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        commandName,
        channelId: interaction.channelId,
      }).catch((err) =>
        logger.error('Failed to log command usage', {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          error: getErrorMessage(err),
        }),
      );
    } catch (err) {
      logger.error('Command error', {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        command: commandName,
        error: getErrorMessage(err),
        stack: err instanceof Error ? err.stack : undefined,
        source: 'slash_command',
      });

      await sendCommandExecutionError(interaction, commandName);
    }
  });
}
