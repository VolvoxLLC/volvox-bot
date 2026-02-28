/**
 * Ticket Command
 * Create and manage support tickets via /ticket.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/134
 */

import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info } from '../logger.js';
import { getConfig } from '../modules/config.js';
import {
  addMember,
  buildTicketPanel,
  closeTicket,
  getTicketConfig,
  openTicket,
  removeMember,
} from '../modules/ticketHandler.js';
import { isModerator } from '../utils/permissions.js';
import { safeEditReply, safeSend } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create and manage support tickets')
  .addSubcommand((sub) =>
    sub
      .setName('open')
      .setDescription('Open a new support ticket')
      .addStringOption((opt) =>
        opt.setName('topic').setDescription('Topic for the ticket').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('close')
      .setDescription('Close the current ticket')
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason for closing').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Add a user to the current ticket')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to add').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('remove')
      .setDescription('Remove a user from the current ticket')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('User to remove').setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('panel')
      .setDescription('Post a persistent ticket panel (Admin only)')
      .addChannelOption((opt) =>
        opt
          .setName('channel')
          .setDescription('Channel to post the panel in')
          .setRequired(false),
      ),
  );

/**
 * Execute the /ticket command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildConfig = getConfig(interaction.guildId);
  const ticketConfig = getTicketConfig(interaction.guildId);

  if (!ticketConfig.enabled) {
    await safeEditReply(interaction, {
      content: '❌ The ticket system is not enabled on this server.',
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'open') {
    await handleOpen(interaction, ticketConfig);
  } else if (subcommand === 'close') {
    await handleClose(interaction);
  } else if (subcommand === 'add') {
    await handleAdd(interaction);
  } else if (subcommand === 'remove') {
    await handleRemove(interaction);
  } else if (subcommand === 'panel') {
    await handlePanel(interaction, guildConfig);
  }
}

/**
 * Handle /ticket open — create a new ticket.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} ticketConfig
 */
async function handleOpen(interaction, ticketConfig) {
  const topic = interaction.options.getString('topic');

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
    await safeEditReply(interaction, {
      content: `❌ ${err.message}`,
    });
  }
}

/**
 * Handle /ticket close — close the current ticket.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleClose(interaction) {
  const reason = interaction.options.getString('reason');
  const thread = interaction.channel;

  if (!thread?.isThread()) {
    await safeEditReply(interaction, {
      content: '❌ This command must be used inside a ticket thread.',
    });
    return;
  }

  try {
    const ticket = await closeTicket(thread, interaction.user, reason);
    await safeEditReply(interaction, {
      content: `✅ Ticket #${ticket.id} has been closed.`,
    });
  } catch (err) {
    await safeEditReply(interaction, {
      content: `❌ ${err.message}`,
    });
  }
}

/**
 * Handle /ticket add — add a user to the current ticket.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleAdd(interaction) {
  const user = interaction.options.getUser('user');
  const thread = interaction.channel;

  if (!thread?.isThread()) {
    await safeEditReply(interaction, {
      content: '❌ This command must be used inside a ticket thread.',
    });
    return;
  }

  try {
    await addMember(thread, user);
    await safeEditReply(interaction, {
      content: `✅ <@${user.id}> has been added to the ticket.`,
    });
  } catch (err) {
    await safeEditReply(interaction, {
      content: `❌ Failed to add user: ${err.message}`,
    });
  }
}

/**
 * Handle /ticket remove — remove a user from the current ticket.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
async function handleRemove(interaction) {
  const user = interaction.options.getUser('user');
  const thread = interaction.channel;

  if (!thread?.isThread()) {
    await safeEditReply(interaction, {
      content: '❌ This command must be used inside a ticket thread.',
    });
    return;
  }

  try {
    await removeMember(thread, user);
    await safeEditReply(interaction, {
      content: `✅ <@${user.id}> has been removed from the ticket.`,
    });
  } catch (err) {
    await safeEditReply(interaction, {
      content: `❌ Failed to remove user: ${err.message}`,
    });
  }
}

/**
 * Handle /ticket panel — post a persistent ticket panel (Admin only).
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {object} guildConfig
 */
async function handlePanel(interaction, guildConfig) {
  // Check admin permissions
  if (
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
    !isModerator(interaction.member, guildConfig)
  ) {
    await safeEditReply(interaction, {
      content: '❌ You need administrator permissions to use this command.',
    });
    return;
  }

  const targetChannel =
    interaction.options.getChannel('channel') || interaction.channel;

  const { embed, row } = buildTicketPanel();

  try {
    await safeSend(targetChannel, { embeds: [embed], components: [row] });
    await safeEditReply(interaction, {
      content: `✅ Ticket panel posted in <#${targetChannel.id}>.`,
    });
    info('Ticket panel posted', {
      guildId: interaction.guildId,
      channelId: targetChannel.id,
      postedBy: interaction.user.id,
    });
  } catch (err) {
    await safeEditReply(interaction, {
      content: `❌ Failed to post panel: ${err.message}`,
    });
  }
}
