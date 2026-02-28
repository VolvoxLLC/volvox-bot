/**
 * Ticket Handler Module
 * Business logic for support ticket creation, closing, member management, and auto-close.
 *
 * Supports two modes:
 * - "thread" (default): creates a private thread per ticket
 * - "channel": creates a dedicated text channel per ticket with permission overrides
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/134
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  OverwriteType,
  PermissionFlagsBits,
} from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { safeSend } from '../utils/safeSend.js';
import { getConfig } from './config.js';

/** Default configuration values for the ticket system */
const TICKET_DEFAULTS = {
  enabled: false,
  mode: 'thread',
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

/** Delay (ms) before deleting a channel-mode ticket so the close message is visible */
const CHANNEL_DELETE_DELAY_MS = 10_000;

/** Track ticket IDs that have received an auto-close warning in this process run */
const warningsSent = new Set();

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
 * Build the permission-override array used when creating a channel-mode ticket.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} userId - The ticket opener
 * @param {string|null} supportRoleId
 * @returns {Array<import('discord.js').OverwriteResolvable>}
 */
function buildChannelPermissions(guild, userId, supportRoleId) {
  const overwrites = [
    // Deny @everyone
    {
      id: guild.id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    // Allow ticket user
    {
      id: userId,
      type: OverwriteType.Member,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
    },
    // Allow bot
    {
      id: guild.members.me?.id ?? guild.client.user.id,
      type: OverwriteType.Member,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];

  if (supportRoleId) {
    overwrites.push({
      id: supportRoleId,
      type: OverwriteType.Role,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  return overwrites;
}

/**
 * Open a new support ticket by creating a private thread or a dedicated text channel.
 *
 * @param {import('discord.js').Guild} guild - The Discord guild
 * @param {import('discord.js').User} user - The user opening the ticket
 * @param {string|null} topic - Optional topic for the ticket
 * @param {string|null} channelId - The channel the ticket panel lives in (for DB tracking)
 * @returns {Promise<{ticket: object, thread: import('discord.js').ThreadChannel|import('discord.js').TextChannel}>}
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
    throw new Error(
      `You already have ${ticketConfig.maxOpenPerUser} open tickets. Please close one before opening another.`,
    );
  }

  const ticketName = topic
    ? `ticket-${user.username}-${topic.slice(0, 20).replace(/\s+/g, '-').toLowerCase()}`
    : `ticket-${user.username}`;

  let ticketChannel;

  if (ticketConfig.mode === 'channel') {
    // ── Channel mode: create a text channel with permission overrides ──
    const parent = ticketConfig.category
      ? guild.channels.cache.get(ticketConfig.category)
      : undefined;

    ticketChannel = await guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      parent: parent?.id ?? undefined,
      permissionOverwrites: buildChannelPermissions(guild, user.id, ticketConfig.supportRole),
      reason: `Support ticket opened by ${user.tag}`,
    });
  } else {
    // ── Thread mode (default): create a private thread ──
    let parentChannel;
    if (ticketConfig.category) {
      const resolved = guild.channels.cache.get(ticketConfig.category);
      // CategoryChannel can't create threads — only use text/news channels
      if (resolved && (resolved.type === ChannelType.GuildText || resolved.type === ChannelType.GuildAnnouncement)) {
        parentChannel = resolved;
      }
    }
    if (!parentChannel && channelId) {
      parentChannel = guild.channels.cache.get(channelId);
    }
    if (!parentChannel) {
      parentChannel = guild.channels.cache.find(
        (ch) =>
          ch.type === ChannelType.GuildText &&
          guild.members.me && ch.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.CreatePrivateThreads),
      );
    }

    if (!parentChannel) {
      throw new Error('No suitable channel found to create a ticket thread.');
    }

    ticketChannel = await parentChannel.threads.create({
      name: ticketName,
      type: ChannelType.PrivateThread,
      reason: `Support ticket opened by ${user.tag}`,
    });

    // Add the user to the thread
    await ticketChannel.members.add(user.id);

    // Add support role members if configured
    if (ticketConfig.supportRole) {
      const role = guild.roles.cache.get(ticketConfig.supportRole);
      if (role) {
        for (const [, member] of role.members) {
          try {
            await ticketChannel.members.add(member.id);
          } catch {
            // Some members may not be fetchable
          }
        }
      }
    }
  }

  // Insert into database (channel ID stored in thread_id for both modes)
  const { rows } = await pool.query(
    `INSERT INTO tickets (guild_id, user_id, topic, thread_id, channel_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [guild.id, user.id, topic, ticketChannel.id, channelId],
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

  await safeSend(ticketChannel, { embeds: [embed], components: [closeButton] });

  info('Ticket opened', {
    ticketId: ticket.id,
    guildId: guild.id,
    userId: user.id,
    topic,
    mode: ticketConfig.mode,
  });

  return { ticket, thread: ticketChannel };
}

/**
 * Close a ticket: save transcript, update DB, archive thread or delete channel.
 *
 * @param {import('discord.js').ThreadChannel|import('discord.js').TextChannel} channel - The ticket thread or channel
 * @param {import('discord.js').User} closer - The user closing the ticket
 * @param {string|null} reason - Optional close reason
 * @returns {Promise<object>} The closed ticket row
 */
export async function closeTicket(channel, closer, reason) {
  const pool = getPool();
  if (!pool) throw new Error('Database not available');

  // Find the ticket by thread_id (stores either thread or channel ID)
  const { rows } = await pool.query('SELECT * FROM tickets WHERE thread_id = $1 AND status = $2', [
    channel.id,
    'open',
  ]);

  if (rows.length === 0) {
    throw new Error('No open ticket found for this thread.');
  }

  const ticket = rows[0];
  const isThread = typeof channel.isThread === 'function' && channel.isThread();

  // Fetch transcript (last 100 messages)
  const messages = await channel.messages.fetch({ limit: 100 });
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

  await safeSend(channel, { embeds: [embed], components: [] });

  // Send transcript to transcript channel if configured
  const ticketConfig = getTicketConfig(ticket.guild_id);
  if (ticketConfig.transcriptChannel) {
    try {
      const guild = channel.guild;
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

  // Archive (thread) or delete (channel)
  if (isThread) {
    try {
      await channel.setArchived(true);
    } catch (err) {
      logError('Failed to archive ticket thread', { ticketId: ticket.id, error: err.message });
    }
  } else {
    // Channel mode: delete after a short delay so the close message is visible
    // NOTE: known limitation — if the process restarts during the delay,
    // the channel won't be deleted (orphaned). A startup cleanup job could address this.
    setTimeout(async () => {
      try {
        await channel.delete(`Ticket #${ticket.id} closed`);
      } catch (err) {
        logError('Failed to delete ticket channel', { ticketId: ticket.id, error: err.message });
      }
    }, CHANNEL_DELETE_DELAY_MS);
  }

  warningsSent.delete(ticket.id);

  info('Ticket closed', {
    ticketId: ticket.id,
    guildId: ticket.guild_id,
    closedBy: closer.id,
    reason,
  });

  return updated[0];
}

/**
 * Add a user to a ticket thread or channel.
 *
 * For thread mode: adds via thread.members.
 * For channel mode: grants ViewChannel + SendMessages via permission overrides.
 *
 * @param {import('discord.js').ThreadChannel|import('discord.js').TextChannel} channel - The ticket thread or channel
 * @param {import('discord.js').User} user - The user to add
 */
export async function addMember(channel, user) {
  const isThread = typeof channel.isThread === 'function' && channel.isThread();

  if (isThread) {
    await channel.members.add(user.id);
  } else {
    await channel.permissionOverwrites.edit(user.id, {
      ViewChannel: true,
      SendMessages: true,
    });
  }

  await safeSend(channel, { content: `✅ <@${user.id}> has been added to the ticket.` });
  info('Member added to ticket', { channelId: channel.id, userId: user.id });
}

/**
 * Remove a user from a ticket thread or channel.
 *
 * For thread mode: removes via thread.members.
 * For channel mode: revokes ViewChannel via permission overrides.
 *
 * @param {import('discord.js').ThreadChannel|import('discord.js').TextChannel} channel - The ticket thread or channel
 * @param {import('discord.js').User} user - The user to remove
 */
export async function removeMember(channel, user) {
  const isThread = typeof channel.isThread === 'function' && channel.isThread();

  if (isThread) {
    await channel.members.remove(user.id);
  } else {
    await channel.permissionOverwrites.delete(user.id);
  }

  await safeSend(channel, { content: `🚫 <@${user.id}> has been removed from the ticket.` });
  info('Member removed from ticket', { channelId: channel.id, userId: user.id });
}

/**
 * Check for tickets that should be auto-closed due to inactivity.
 * Sends a warning after autoCloseHours, then closes after an additional 24h.
 * Works for both thread-mode and channel-mode tickets.
 *
 * @param {import('discord.js').Client} client - The Discord client
 */
export async function checkAutoClose(client) {
  const pool = getPool();
  if (!pool) return;

  // Find all open tickets for guilds the bot is currently in
  const guildIds = Array.from(client.guilds.cache.keys());
  if (guildIds.length === 0) return;

  const { rows: openTickets } = await pool.query(
    'SELECT * FROM tickets WHERE status = $1 AND guild_id = ANY($2::text[])',
    ['open', guildIds],
  );

  for (const ticket of openTickets) {
    try {
      const ticketConfig = getTicketConfig(ticket.guild_id);
      if (!ticketConfig.enabled) continue;

      const guild = client.guilds.cache.get(ticket.guild_id);
      if (!guild) continue;

      let channel;
      try {
        channel = await guild.channels.fetch(ticket.thread_id);
      } catch {
        // Thread/channel was deleted — close the ticket in DB
        await pool.query(
          `UPDATE tickets SET status = 'closed', close_reason = 'Thread deleted', closed_at = NOW() WHERE id = $1`,
          [ticket.id],
        );
        continue;
      }

      if (!channel) continue;

      // Accept both threads and text channels
      const isThread = typeof channel.isThread === 'function' && channel.isThread();
      if (!isThread && channel.type !== ChannelType.GuildText) continue;

      // Get the last message timestamp
      const lastMessages = await channel.messages.fetch({ limit: 1 });
      const lastMessage = lastMessages.size > 0 ? lastMessages.values().next().value : null;
      const lastActivity = lastMessage ? lastMessage.createdAt : new Date(ticket.created_at);

      const hoursSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);

      const totalCloseThreshold = ticketConfig.autoCloseHours + AUTO_CLOSE_WARNING_HOURS;

      if (hoursSinceActivity >= totalCloseThreshold) {
        // Close the ticket
        await closeTicket(channel, client.user, 'Auto-closed due to inactivity');
      } else if (hoursSinceActivity >= ticketConfig.autoCloseHours) {
        if (!warningsSent.has(ticket.id)) {
          await safeSend(channel, {
            content: `⚠️ This ticket will be **auto-closed in ${AUTO_CLOSE_WARNING_HOURS} hours** due to inactivity. Send a message to keep it open.`,
          });
          warningsSent.add(ticket.id);
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
        'A private ticket will be opened where you can describe your issue ' +
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
