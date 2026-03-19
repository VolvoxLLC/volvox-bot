/**
 * Ticket Button and Modal Handlers
 * Handles Discord interactions for opening and closing support tickets.
 */

import {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { error as logError } from '../../logger.js';
import { safeEditReply, safeReply } from '../../utils/safeSend.js';
import { closeTicket, getTicketConfig, openTicket } from '../ticketHandler.js';

/**
 * Handle a ticket open button interaction.
 * Shows a modal to collect the ticket topic.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>} true if handled, false if not applicable
 */
export async function handleTicketOpenButton(interaction) {
  if (!interaction.isButton()) return false;
  if (interaction.customId !== 'ticket_open') return false;

  const ticketConfig = getTicketConfig(interaction.guildId);
  if (!ticketConfig.enabled) {
    try {
      await safeReply(interaction, {
        content: '❌ The ticket system is not enabled on this server.',
        ephemeral: true,
      });
    } catch {
      // Ignore
    }
    return true;
  }

  const modal = new ModalBuilder().setCustomId('ticket_open_modal').setTitle('Open Support Ticket');

  const topicInput = new TextInputBuilder()
    .setCustomId('ticket_topic')
    .setLabel('What do you need help with?')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Describe your issue...')
    .setMaxLength(200)
    .setRequired(false);

  const row = new ActionRowBuilder().addComponents(topicInput);
  modal.addComponents(row);

  try {
    await interaction.showModal(modal);
  } catch (err) {
    logError('Failed to show ticket modal', {
      userId: interaction.user?.id,
      error: err.message,
    });
  }
  return true;
}

/**
 * Handle a ticket modal submission interaction.
 *
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @returns {Promise<boolean>} true if handled, false if not applicable
 */
export async function handleTicketModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (interaction.customId !== 'ticket_open_modal') return false;

  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    logError('Failed to defer ticket modal reply', {
      userId: interaction.user?.id,
      guildId: interaction.guildId,
      error: err?.message,
    });
    return true;
  }

  const topic = interaction.fields.getTextInputValue('ticket_topic') || null;

  try {
    const { ticket, thread } = await openTicket(
      interaction.guild,
      interaction.user,
      topic,
      interaction.channelId,
    );

    await safeEditReply(interaction, {
      content: `✅ Ticket #${ticket.id} created! Head to <#${thread.id}>.`,
    });
  } catch (err) {
    logError('Ticket modal handler failed', {
      userId: interaction.user?.id,
      guildId: interaction.guildId,
      error: err?.message,
    });

    try {
      await safeEditReply(interaction, {
        content: '❌ An error occurred processing your ticket.',
      });
    } catch (replyErr) {
      logError('Failed to send fallback reply', { error: replyErr?.message });
    }
  }
  return true;
}

/**
 * Handle a ticket close button interaction.
 * Expects button clicks with customId matching `ticket_close_<id>`.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 * @returns {Promise<boolean>} true if handled, false if not applicable
 */
export async function handleTicketCloseButton(interaction) {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith('ticket_close_')) return false;

  try {
    await interaction.deferReply({ ephemeral: true });
  } catch (err) {
    logError('Failed to defer ticket close reply', {
      userId: interaction.user?.id,
      guildId: interaction.guildId,
      error: err?.message,
    });
    return true;
  }

  const ticketChannel = interaction.channel;
  const isThread = typeof ticketChannel?.isThread === 'function' && ticketChannel.isThread();
  const isTextChannel = ticketChannel?.type === ChannelType.GuildText;

  if (!isThread && !isTextChannel) {
    await safeEditReply(interaction, {
      content: '❌ This button can only be used inside a ticket channel or thread.',
    });
    return true;
  }

  try {
    const ticket = await closeTicket(ticketChannel, interaction.user, 'Closed via button');
    await safeEditReply(interaction, {
      content: `✅ Ticket #${ticket.id} has been closed.`,
    });
  } catch (err) {
    logError('Ticket close handler failed', {
      userId: interaction.user?.id,
      guildId: interaction.guildId,
      channelId: ticketChannel?.id,
      error: err?.message,
    });

    try {
      await safeEditReply(interaction, {
        content: '❌ An error occurred while closing the ticket.',
      });
    } catch (replyErr) {
      logError('Failed to send fallback reply', { error: replyErr?.message });
    }
  }
  return true;
}

/** @deprecated Use handleTicketOpenButton directly */
export function registerTicketOpenButtonHandler(client) {
  client.on('interactionCreate', handleTicketOpenButton);
}

/** @deprecated Use handleTicketModal directly */
export function registerTicketModalHandler(client) {
  client.on('interactionCreate', handleTicketModal);
}

/** @deprecated Use handleTicketCloseButton directly */
export function registerTicketCloseButtonHandler(client) {
  client.on('interactionCreate', handleTicketCloseButton);
}
