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
 * Dispatches an autocomplete interaction to the matching command or returns no suggestions.
 *
 * If the command is not found or has no `autocomplete` handler, responds with an empty array.
 * If the handler throws, logs the error with guild and channel context and responds with an empty array.
 * @param {import('discord.js').Client} client - Discord client instance containing registered commands.
 * @param {import('discord.js').AutocompleteInteraction} interaction - The autocomplete interaction to handle.
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
 * Send an ephemeral error message to the user indicating the command failed; use a follow-up if the interaction was already replied to or deferred.
 *
 * If sending the response fails, a debug-level log is recorded with `guildId`, `channelId`, the extracted error message, and the `command` name.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Interaction to respond to.
 * @param {string} commandName - Command name used for logging context.
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
 * Register an InteractionCreate listener that routes autocomplete interactions and handles chat input (slash) commands.
 *
 * The handler enforces per-guild permissions, replies ephemerally for permission denials or missing commands, executes the matched command and records usage, and sends an ephemeral error response if command processing fails.
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
