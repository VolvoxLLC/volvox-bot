/**
 * Poll Handler Module
 * Handles button interactions for poll voting and auto-close logic.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/47
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { safeReply } from '../utils/safeSend.js';

const POLL_COLOR = 0x5865f2;

/**
 * Build the poll embed showing current vote counts.
 *
 * @param {object} poll - Poll row from the database
 * @returns {EmbedBuilder}
 */
export function buildPollEmbed(poll) {
  const options = poll.options;
  const votes = poll.votes || {};

  // Count votes per option
  const voteCounts = new Array(options.length).fill(0);
  for (const indices of Object.values(votes)) {
    for (const idx of indices) {
      if (idx >= 0 && idx < options.length) {
        voteCounts[idx]++;
      }
    }
  }

  const totalVotes = voteCounts.reduce((a, b) => a + b, 0);
  const voterCount = Object.keys(votes).length;

  const lines = options.map((opt, i) => {
    const count = voteCounts[i];
    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
    const filled = Math.round(pct / 10);
    const bar = '▓'.repeat(filled) + '░'.repeat(10 - filled);
    return `**${i + 1}.** ${opt}\n${bar} ${pct}% (${count} vote${count !== 1 ? 's' : ''})`;
  });

  const description = lines.join('\n\n');

  let footer = `Poll #${poll.id}`;
  if (poll.closed) {
    footer += ' • Closed';
  } else if (poll.closes_at) {
    const ts = Math.floor(new Date(poll.closes_at).getTime() / 1000);
    footer += ` • Closes <t:${ts}:R>`;
  } else {
    footer += ' • No time limit';
  }
  footer += ` • ${voterCount} voter${voterCount !== 1 ? 's' : ''}`;

  const titleQuestion =
    poll.question.length > 253 ? `${poll.question.slice(0, 250)}...` : poll.question;
  const embed = new EmbedBuilder()
    .setTitle(`📊 ${titleQuestion}`)
    .setDescription(description)
    .setColor(POLL_COLOR)
    .setFooter({ text: footer });

  if (poll.multi_vote) {
    embed.setDescription(`${description}\n\n*Multiple votes allowed*`);
  }

  return embed;
}

/**
 * Build button rows for poll options.
 *
 * @param {number} pollId - Poll ID
 * @param {string[]} options - Poll option labels
 * @param {boolean} disabled - Whether buttons should be disabled
 * @returns {ActionRowBuilder[]}
 */
export function buildPollButtons(pollId, options, disabled = false) {
  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let i = 0; i < options.length; i++) {
    if (i > 0 && i % 5 === 0) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }

    const prefix = `${i + 1}. `;
    const maxLen = 80 - prefix.length;
    const label = options[i].length > maxLen ? `${options[i].slice(0, maxLen - 3)}...` : options[i];
    currentRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`poll_vote_${pollId}_${i}`)
        .setLabel(`${prefix}${label}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
    );
  }

  rows.push(currentRow);
  return rows;
}

/**
 * Handle a poll vote button click.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handlePollVote(interaction) {
  const match = interaction.customId.match(/^poll_vote_(\d+)_(\d+)$/);
  if (!match) return;

  const pollId = Number.parseInt(match[1], 10);
  const optionIndex = Number.parseInt(match[2], 10);

  const pool = getPool();
  const client = await pool.connect();

  let poll;
  let votes;
  let removed = false;
  let optionName;

  try {
    await client.query('BEGIN');

    // Lock the row to prevent concurrent vote modifications
    const { rows } = await client.query(
      'SELECT * FROM polls WHERE id = $1 AND guild_id = $2 FOR UPDATE',
      [pollId, interaction.guildId],
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      await safeReply(interaction, {
        content: '❌ This poll no longer exists.',
        ephemeral: true,
      });
      return;
    }

    poll = rows[0];

    if (poll.closed) {
      await client.query('ROLLBACK');
      await safeReply(interaction, {
        content: '❌ This poll is closed.',
        ephemeral: true,
      });
      return;
    }

    // Reject votes after closes_at
    if (poll.closes_at && new Date(poll.closes_at) <= new Date()) {
      await client.query('ROLLBACK');
      await safeReply(interaction, {
        content: '❌ This poll has expired.',
        ephemeral: true,
      });
      return;
    }

    if (optionIndex < 0 || optionIndex >= poll.options.length) {
      await client.query('ROLLBACK');
      await safeReply(interaction, {
        content: '❌ Invalid option.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;
    votes = poll.votes || {};
    const userVotes = votes[userId] || [];
    optionName = poll.options[optionIndex];

    if (poll.multi_vote) {
      if (userVotes.includes(optionIndex)) {
        votes[userId] = userVotes.filter((i) => i !== optionIndex);
        if (votes[userId].length === 0) delete votes[userId];
        removed = true;
      } else {
        votes[userId] = [...userVotes, optionIndex];
      }
    } else {
      if (userVotes.includes(optionIndex)) {
        delete votes[userId];
        removed = true;
      } else {
        votes[userId] = [optionIndex];
      }
    }

    await client.query('UPDATE polls SET votes = $1 WHERE id = $2', [
      JSON.stringify(votes),
      pollId,
    ]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Update the poll object for embed rebuild
  poll.votes = votes;

  // Update the embed on the message
  try {
    const embed = buildPollEmbed(poll);
    await interaction.message.edit({
      embeds: [embed],
    });
  } catch (err) {
    logError('Failed to update poll embed', { pollId, error: err.message });
  }

  // Ephemeral confirmation
  const emoji = removed ? '❌' : '✅';
  const action = removed ? 'Vote removed for' : 'Voted for';
  await safeReply(interaction, {
    content: `${emoji} ${action} **${optionName}**`,
    ephemeral: true,
  });

  info('Poll vote recorded', {
    pollId,
    userId: interaction.user.id,
    optionIndex,
    removed,
    anonymous: poll.anonymous,
  });
}

/**
 * Close a poll: update DB, edit embed, disable buttons.
 *
 * @param {number} pollId - Poll ID
 * @param {import('discord.js').Client} client - Discord client
 * @returns {Promise<boolean>} Whether the poll was successfully closed
 */
export async function closePoll(pollId, client) {
  const pool = getPool();

  const { rows } = await pool.query(
    'UPDATE polls SET closed = true WHERE id = $1 AND closed = false RETURNING *',
    [pollId],
  );

  if (rows.length === 0) return false;

  const poll = rows[0];

  try {
    const channel = await client.channels.fetch(poll.channel_id).catch(() => null);
    if (channel && poll.message_id) {
      const message = await channel.messages.fetch(poll.message_id).catch(() => null);
      if (message) {
        const embed = buildPollEmbed(poll);
        const buttons = buildPollButtons(poll.id, poll.options, true);
        await message.edit({ embeds: [embed], components: buttons });
      }
    }
  } catch (err) {
    logError('Failed to edit closed poll message', { pollId, error: err.message });
  }

  info('Poll closed', { pollId, guildId: poll.guild_id });
  return true;
}

/**
 * Check for and close expired polls.
 *
 * @param {import('discord.js').Client} client - Discord client
 */
export async function closeExpiredPolls(client) {
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id FROM polls WHERE closed = false AND closes_at IS NOT NULL AND closes_at <= NOW()',
    );

    for (const row of rows) {
      try {
        await closePoll(row.id, client);
      } catch (err) {
        logError('Failed to close expired poll', { pollId: row.id, error: err.message });
      }
    }
  } catch (err) {
    logError('Poll expiry check failed', { error: err.message });
  }
}
