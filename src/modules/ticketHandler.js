/**
 * Ticket Handler Module
 * Business logic for support ticket creation, closing, member management, and auto-close.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/134
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { safeSend } from '../utils/safeSend.js';
import { getConfig } from './config.js';

/** Default configuration values for the ticket system */
const TICKET_DEFAULTS = {
  enabled: false,
  supportRole: null,
  category: null,
  autoCloseHours: 48,
  transcriptChannel: null,
  maxOpenPerUser: 3,
};

/** Warning hours before auto-close (sent after autoCloseHours, then closed after this) */
const AUTO_CLOSE_WARNING_HOURS = 24;

/** Embed colour for tickets */
const TICKET_COLOR = 0x5865f2;

/** Embed colour for closed tickets */
const TICKET_CLOSED_COLOR = 0xed4245;

/** Embed colour for the ticket panel */
const TICKET_PANEL_COLOR = 0x57f287;

/**
 * Resolve ticket config from guild config with defaults.
 *
 * @param {string} guildId - Guild ID
 * @returns {object} Merged ticket config
 */
export function getTicketConfig(guildId) {
  const cfg = getConfig(guildId);
  return { ...TICKET_DEFAULTS, ...cfg.tickets };
}

/**
 * Open a new support ticket by creating a private thread.
 *
 * @param {import('discord.js').Guild} guild - The Discord guild
 * @param {import('discord.js').User} user - The user opening the ticket
 * @param {string|null} topic - Optional topic for the ticket
 * @param {string|null} channelId - The channel the ticket panel lives in (for DB tracking)
 * @returns {Promise<{ticket: object, thread: import('discord.js').ThreadChannel}>}
 */
export async function openTicket(guild, user, topic, channelId = null) {
  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  const ticketConfig = getTicketConfig(guild.id);

  // Check max open tickets per user
  const { rows: openTickets } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM tickets WHERE guild_id = $1 AND user_id = $2 AND status = $3',
    [guild.id, user.id, 'open'],
  );

  if (openTickets[0].count >= ticketConfig.maxOpenPerUser) {
    throw new Error(`You already have ${ticketConfig.maxOpenPerUser} open tickets. Please close one before opening another.`);
  }

  // Find the channel to create the thread in
  let parentChannel;
  if (ticketConfig.category) {
    parentChannel = guild.channels.cache.get(ticketConfig.category);
  }
  if (!parentChannel && channelId) {
    parentChannel = guild.channels.cache.get(channelId);
  }
  if (!parentChannel) {
    // Fallback to the first text channel
    parentChannel = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildText && ch.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.CreatePrivateThreads),
    );
  }

  if (!parentChannel) {
    throw new Error('No suitable channel found to create a ticket thread.');
  }

  // Create a private thread
  const ticketName = topic
    ? `ticket-${user.username}-${topic.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`
    : `ticket-${user.username}`;

  const thread = await parentChannel.threads.create({
    name: ticketName,
    type: ChannelType.PrivateThread,
    reason: `Support ticket opened by ${user.tag}`,
  });

  // Add the user to the thread
  await thread.members.add(user.id);

  // Add support role members if configured
  if (ticketConfig.supportRole) {
    const role = guild.roles.cache.get(ticketConfig.supportRole);
    if (role) {
      for (const [, member] of role.members) {
        try {
          await thread.members.add(member.id);
        } catch {
          // Some members may not be fetchable
        }
      }
    }
  }

  // Insert into database
  const { rows } = await pool.query(
    `INSERT INTO tickets (guild_id, user_id, topic, thread_id, channel_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [guild.id, user.id, topic, thread.id, channelId],
  );

  const ticket = rows[0];

  // Post initial embed
  const embed = new EmbedBuilder()
    .setColor(TICKET_COLOR)
    .setTitle(`🎫 Ticket #${ticket.id}`)
    .setDescription(topic || 'No topic provided')
    .addFields(
      { name: 'Opened by', value: `<@${user.id}>`, inline: true },
      { name: 'Status', value: '🟢 Open', inline: true },
    )
    .setTimestamp();

  const closeButton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_close_${ticket.id}`)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔒'),
  );

  await safeSend(thread, { embeds: [embed], components: [closeButton] });

  info('Ticket opened', { ticketId: ticket.id, guildId: guild.id, userId: user.id, topic });

  return { ticket, thread };
}

/**
 * Close a ticket: save transcript, update DB, archive thread.
 *
 * @param {import('discord.js').ThreadChannel} thread - The ticket thread
 * @param {import('discord.js').User} closer - The user closing the ticket
 * @param {string|null} reason - Optional close reason
 * @returns {Promise<object>} The closed ticket row
 */
export async function closeTicket(thread, closer, reason) {
  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  // Find the ticket by thread_id
  const { rows } = await pool.query(
    'SELECT * FROM tickets WHERE thread_id = $1 AND status = $2',
    [thread.id, 'open'],
  );

  if (rows.length === 0) {
    throw new Error('No open ticket found for this thread.');
  }

  const ticket = rows[0];

  // Fetch transcript (last 100 messages)
  const messages = await thread.messages.fetch({ limit: 100 });
  const transcript = Array.from(messages.values())
    .reverse()
    .map((msg) => ({
      author: msg.author?.tag || 'Unknown',
      authorId: msg.author?.id || null,
      content: msg.content || '',
      timestamp: msg.createdAt.toISOString(),
    }));

  // Update the ticket in DB
  const { rows: updated } = await pool.query(
    `UPDATE tickets
     SET status = 'closed', closed_by = $1, close_reason = $2, closed_at = NOW(), transcript = $3
     WHERE id = $4 RETURNING *`,
    [closer.id, reason, JSON.stringify(transcript), ticket.id],
  );

  // Post closing embed
  const embed = new EmbedBuilder()
    .setColor(TICKET_CLOSED_COLOR)
    .setTitle(`🔒 Ticket #${ticket.id} Closed`)
    .addFields(
      { name: 'Closed by', value: `<@${closer.id}>`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: true },
    )
    .setTimestamp();

  await safeSend(thread, { embeds: [embed], components: [] });

  // Send transcript to transcript channel if configured
  const ticketConfig = getTicketConfig(ticket.guild_id);
  if (ticketConfig.transcriptChannel) {
    try {
      const guild = thread.guild;
      const transcriptCh = guild.channels.cache.get(ticketConfig.transcriptChannel);
      if (transcriptCh) {
        const transcriptEmbed = new EmbedBuilder()
          .setColor(TICKET_CLOSED_COLOR)
          .setTitle(`📋 Ticket #${ticket.id} Transcript`)
          .setDescription(`Topic: ${ticket.topic || 'None'}\nMessages: ${transcript.length}`)
          .addFields(
            { name: 'Opened by', value: `<@${ticket.user_id}>`, inline: true },
            { name: 'Closed by', value: `<@${closer.id}>`, inline: true },
            { name: 'Reason', value: reason || 'No reason provided', inline: true },
          )
          .setTimestamp();
        await safeSend(transcriptCh, { embeds: [transcriptEmbed] });
      }
    } catch (err) {
      logError('Failed to send ticket transcript', { ticketId: ticket.id, error: err.message });
    }
  }

  // Archive the thread
  try {
    await thread.setArchived(true);
  } catch (err) {
    logError('Failed to archive ticket thread', { ticketId: ticket.id, error: err.message });
  }

  info('Ticket closed', {
    ticketId: ticket.id,
    guildId: ticket.guild_id,
    closedBy: closer.id,
    reason,
  });

  return updated[0];
}

/**
 * Add a user to a ticket thread.
 *
 * @param {import('discord.js').ThreadChannel} thread - The ticket thread
 * @param {import('discord.js').User} user - The user to add
 */
export async function addMember(thread, user) {
  await thread.members.add(user.id);
  await safeSend(thread, { content: `✅ <@${user.id}> has been added to the ticket.` });
  info('Member added to ticket', { threadId: thread.id, userId: user.id });
}

/**
 * Remove a user from a ticket thread.
 *
 * @param {import('discord.js').ThreadChannel} thread - The ticket thread
 * @param {import('discord.js').User} user - The user to remove
 */
export async function removeMember(thread, user) {
  await thread.members.remove(user.id);
  await safeSend(thread, { content: `🚫 <@${user.id}> has been removed from the ticket.` });
  info('Member removed from ticket', { threadId: thread.id, userId: user.id });
}

/**
 * Check for tickets that should be auto-closed due to inactivity.
 * Sends a warning after autoCloseHours, then closes after an additional 24h.
 *
 * @param {import('discord.js').Client} client - The Discord client
 */
export async function checkAutoClose(client) {
  const pool = getPool();
  if (!pool) return;

  // Find all open tickets
  const { rows: openTickets } = await pool.query(
    'SELECT * FROM tickets WHERE status = $1',
    ['open'],
  );

  for (const ticket of openTickets) {
    try {
      const ticketConfig = getTicketConfig(ticket.guild_id);
      if (!ticketConfig.enabled) continue;

      const guild = client.guilds.cache.get(ticket.guild_id);
      if (!guild) continue;

      let thread;
      try {
        thread = await guild.channels.fetch(ticket.thread_id);
      } catch {
        // Thread was deleted — close the ticket in DB
        await pool.query(
          `UPDATE tickets SET status = 'closed', close_reason = 'Thread deleted', closed_at = NOW() WHERE id = $1`,
          [ticket.id],
        );
        continue;
      }

      if (!thread || !thread.isThread()) continue;

      // Get the last message timestamp in the thread
      const lastMessages = await thread.messages.fetch({ limit: 1 });
      const lastMessage = lastMessages.size > 0 ? lastMessages.values().next().value : null;
      const lastActivity = lastMessage
        ? lastMessage.createdAt
        : new Date(ticket.created_at);

      const hoursSinceActivity =
        (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);

      const totalCloseThreshold = ticketConfig.autoCloseHours + AUTO_CLOSE_WARNING_HOURS;

      if (hoursSinceActivity >= totalCloseThreshold) {
        // Close the ticket
        await closeTicket(thread, client.user, 'Auto-closed due to inactivity');
      } else if (hoursSinceActivity >= ticketConfig.autoCloseHours) {
        // Check if we already sent a warning (look for our warning message)
        const recentMessages = await thread.messages.fetch({ limit: 5 });
        const hasWarning = Array.from(recentMessages.values()).some(
          (msg) => msg.author?.id === client.user.id && msg.content?.includes('auto-close'),
        );

        if (!hasWarning) {
          await safeSend(thread, {
            content: `⚠️ This ticket will be **auto-closed in ${AUTO_CLOSE_WARNING_HOURS} hours** due to inactivity. Send a message to keep it open.`,
          });
          info('Auto-close warning sent', { ticketId: ticket.id });
        }
      }
    } catch (err) {
      logError('Auto-close check failed for ticket', {
        ticketId: ticket.id,
        error: err.message,
      });
    }
  }
}

/**
 * Build the persistent ticket panel embed with an "Open Ticket" button.
 *
 * @returns {{ embed: EmbedBuilder, row: ActionRowBuilder }}
 */
export function buildTicketPanel() {
  const embed = new EmbedBuilder()
    .setColor(TICKET_PANEL_COLOR)
    .setTitle('🎫 Support Tickets')
    .setDescription(
      'Need help? Click the button below to open a support ticket.\n\n' +
        'A private thread will be created where you can describe your issue ' +
        'and our support team will assist you.',
    )
    .setFooter({ text: 'Volvox Bot • Ticket System' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open')
      .setLabel('Open Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫'),
  );

  return { embed, row };
}
