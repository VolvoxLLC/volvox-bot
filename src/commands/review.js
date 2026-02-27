/**
 * Review Command
 * Peer code review request system — request, claim, and complete code reviews.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/49
 */

import { SlashCommandBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, warn } from '../logger.js';
import { getConfig } from '../modules/config.js';
import {
  buildClaimButton,
  buildReviewEmbed,
  STATUS_LABELS,
  updateReviewMessage,
} from '../modules/reviewHandler.js';
import { safeEditReply } from '../utils/safeSend.js';

export const data = new SlashCommandBuilder()
  .setName('review')
  .setDescription('Request, claim, and complete peer code reviews')
  .addSubcommand((sub) =>
    sub
      .setName('request')
      .setDescription('Request a code review')
      .addStringOption((opt) =>
        opt
          .setName('url')
          .setDescription('URL to the code (PR, gist, GitHub, etc.)')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('description')
          .setDescription('What should the reviewer focus on?')
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('language')
          .setDescription('Programming language (e.g. JavaScript, Python)')
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('list')
      .setDescription('List review requests')
      .addStringOption((opt) =>
        opt
          .setName('status')
          .setDescription('Filter by status (default: open)')
          .setRequired(false)
          .addChoices(
            { name: 'Open', value: 'open' },
            { name: 'Claimed', value: 'claimed' },
            { name: 'Completed', value: 'completed' },
            { name: 'Stale', value: 'stale' },
            { name: 'All', value: 'all' },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('complete')
      .setDescription('Mark a review as completed')
      .addIntegerOption((opt) =>
        opt.setName('id').setDescription('Review ID to complete').setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName('feedback')
          .setDescription('Optional feedback for the requester')
          .setRequired(false),
      ),
  );

/**
 * Execute the /review command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildConfig = getConfig(interaction.guildId);
  if (!guildConfig.review?.enabled) {
    await safeEditReply(interaction, {
      content: '❌ Code reviews are not enabled on this server.',
    });
    return;
  }

  const pool = getPool();
  if (!pool) {
    await safeEditReply(interaction, { content: '❌ Database is not available.' });
    return;
  }

  if (!interaction.guildId) {
    await safeEditReply(interaction, { content: '❌ This command can only be used in a server.' });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'request') {
    await handleRequest(interaction, pool, guildConfig);
  } else if (subcommand === 'list') {
    await handleList(interaction, pool);
  } else if (subcommand === 'complete') {
    await handleComplete(interaction, pool, guildConfig);
  }
}

/**
 * Basic URL validity check.
 *
 * @param {string} str
 * @returns {boolean}
 */
function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handle /review request
 */
async function handleRequest(interaction, pool, guildConfig) {
  const url = interaction.options.getString('url');
  const description = interaction.options.getString('description');
  const language = interaction.options.getString('language');

  if (!isValidUrl(url)) {
    await safeEditReply(interaction, {
      content:
        '❌ The URL you provided is not valid. Please provide a full URL (e.g. `https://github.com/...`).',
    });
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO reviews (guild_id, requester_id, url, description, language)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [interaction.guildId, interaction.user.id, url, description, language ?? null],
  );

  const review = rows[0];

  // Determine where to post the review embed
  const reviewChannelId = guildConfig.review?.channelId;
  let targetChannel = interaction.channel;

  if (reviewChannelId && reviewChannelId !== interaction.channelId) {
    try {
      const fetched = await interaction.client.channels.fetch(reviewChannelId);
      if (fetched) targetChannel = fetched;
    } catch {
      warn('Review channel not found, using current channel', {
        reviewChannelId,
        guildId: interaction.guildId,
      });
    }
  }

  const embed = buildReviewEmbed(review, interaction.user.username);
  const row = buildClaimButton(review.id);

  const message = await targetChannel.send({ embeds: [embed], components: [row] });

  // Store message + channel reference for later updates
  await pool.query('UPDATE reviews SET message_id = $1, channel_id = $2 WHERE id = $3', [
    message.id,
    targetChannel.id,
    review.id,
  ]);

  info('Review request created', {
    reviewId: review.id,
    guildId: interaction.guildId,
    requesterId: interaction.user.id,
    language,
  });

  await safeEditReply(interaction, {
    content: `✅ Review request **#${review.id}** posted! Someone will claim it soon.`,
  });
}

/**
 * Handle /review list
 */
async function handleList(interaction, pool) {
  const statusFilter = interaction.options.getString('status') ?? 'open';

  let query;
  let params;

  if (statusFilter === 'all') {
    query = `SELECT * FROM reviews WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 20`;
    params = [interaction.guildId];
  } else {
    query = `SELECT * FROM reviews WHERE guild_id = $1 AND status = $2 ORDER BY created_at DESC LIMIT 20`;
    params = [interaction.guildId, statusFilter];
  }

  const { rows } = await pool.query(query, params);

  if (rows.length === 0) {
    const label = statusFilter === 'all' ? '' : ` **${statusFilter}**`;
    await safeEditReply(interaction, {
      content: `📭 No${label} review requests found in this server.`,
    });
    return;
  }

  const statusLabel =
    statusFilter === 'all' ? 'All' : (STATUS_LABELS[statusFilter] ?? statusFilter);
  const header = `🔍 **Review Requests — ${statusLabel} (${rows.length})**\n\n`;
  const lines = [];
  let totalLen = header.length;

  for (const row of rows) {
    const age = Math.floor(
      (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24),
    );
    const ageStr = age === 0 ? 'today' : age === 1 ? '1 day ago' : `${age} days ago`;
    const urlSnip = row.url.length > 50 ? `${row.url.slice(0, 47)}…` : row.url;
    const langStr = row.language ? ` · ${row.language}` : '';
    const reviewerStr = row.reviewer_id ? ` · reviewer: <@${row.reviewer_id}>` : '';
    const line = `**#${row.id}** — <@${row.requester_id}>${langStr} · ${STATUS_LABELS[row.status] ?? row.status} · ${ageStr}${reviewerStr}\n> ${urlSnip}`;

    if (totalLen + line.length + 2 > 1900) {
      lines.push(`… and ${rows.length - lines.length} more`);
      break;
    }
    lines.push(line);
    totalLen += line.length + 2;
  }

  await safeEditReply(interaction, {
    content: `${header}${lines.join('\n\n')}`,
  });
}

/**
 * Handle /review complete
 */
async function handleComplete(interaction, pool, guildConfig) {
  const reviewId = interaction.options.getInteger('id');
  const feedback = interaction.options.getString('feedback');

  const { rows } = await pool.query('SELECT * FROM reviews WHERE id = $1 AND guild_id = $2', [
    reviewId,
    interaction.guildId,
  ]);

  if (rows.length === 0) {
    await safeEditReply(interaction, {
      content: `❌ No review with ID **#${reviewId}** found in this server.`,
    });
    return;
  }

  const review = rows[0];

  // Guard on status before checking reviewer — gives more actionable error messages.
  if (review.status === 'open') {
    await safeEditReply(interaction, {
      content: `❌ Review **#${reviewId}** hasn't been claimed yet.`,
    });
    return;
  }

  if (review.status === 'completed') {
    await safeEditReply(interaction, {
      content: `❌ Review **#${reviewId}** is already completed.`,
    });
    return;
  }

  if (review.status === 'stale') {
    await safeEditReply(interaction, {
      content: `❌ Review **#${reviewId}** has expired.`,
    });
    return;
  }

  if (review.reviewer_id !== interaction.user.id) {
    await safeEditReply(interaction, {
      content: '❌ Only the assigned reviewer can complete this review.',
    });
    warn('Review complete permission denied', {
      userId: interaction.user.id,
      reviewId,
      reviewerId: review.reviewer_id,
    });
    return;
  }

  // Update status to completed
  const { rows: updated } = await pool.query(
    `UPDATE reviews
     SET status = 'completed', completed_at = NOW(), feedback = $1
     WHERE id = $2
     RETURNING *`,
    [feedback ?? null, reviewId],
  );

  const completedReview = updated[0];

  // Try to update the original embed
  await updateReviewMessage(completedReview, interaction.client);

  // Award XP to reviewer if reputation enabled
  const xpReward = guildConfig.review?.xpReward ?? 50;
  if (guildConfig.reputation?.enabled && xpReward > 0) {
    try {
      await pool.query(
        `INSERT INTO reputation (guild_id, user_id, xp, messages_count, last_xp_gain)
         VALUES ($1, $2, $3, 0, NOW())
         ON CONFLICT (guild_id, user_id) DO UPDATE
           SET xp = reputation.xp + $3,
               last_xp_gain = NOW()`,
        [interaction.guildId, interaction.user.id, xpReward],
      );
      info('Review XP awarded', {
        reviewerId: interaction.user.id,
        guildId: interaction.guildId,
        xp: xpReward,
      });
    } catch (err) {
      warn('Failed to award review XP', { error: err.message, reviewId });
    }
  }

  info('Review completed', {
    reviewId,
    guildId: interaction.guildId,
    reviewerId: interaction.user.id,
    hasFeedback: !!feedback,
  });

  const xpNote = guildConfig.reputation?.enabled && xpReward > 0 ? ` +${xpReward} XP awarded!` : '';

  await safeEditReply(interaction, {
    content: `✅ Review **#${reviewId}** marked as completed!${xpNote}`,
  });
}
