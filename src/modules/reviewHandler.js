/**
 * Review Handler Module
 * Business logic for review embed building, claim button interactions, and stale review cleanup.
 * Kept separate from the slash command definition so the scheduler can import { fetchChannelCached } from '../utils/discordCache.js';
import it without
 * pulling in SlashCommandBuilder (which breaks index.test.js's discord.js mock).
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/49
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { info, warn } from '../logger.js';
import { safeReply, safeSend } from '../utils/safeSend.js';
import { getConfig } from './config.js';

/** Embed colours keyed by status */
export const STATUS_COLORS = {
  open: 0x5865f2,
  claimed: 0xffa500,
  completed: 0x57f287,
  stale: 0x95a5a6,
};

/** Human-readable status labels */
export const STATUS_LABELS = {
  open: '🔵 Open',
  claimed: '🟠 Claimed',
  completed: '🟢 Completed',
  stale: '⚫ Stale',
};

/**
 * Build the review embed.
 *
 * @param {object} review - Review row from the database
 * @param {string} [requesterTag] - Requester's display name/tag
 * @param {string} [reviewerTag] - Reviewer's display name/tag if claimed
 * @returns {EmbedBuilder}
 */
export function buildReviewEmbed(review, requesterTag, reviewerTag) {
  const color = STATUS_COLORS[review.status] ?? STATUS_COLORS.open;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Code Review Request #${review.id}`)
    .addFields(
      {
        name: '🔗 URL',
        value: review.url.length > 200 ? `${review.url.slice(0, 197)}…` : review.url,
        inline: false,
      },
      {
        name: '📝 Description',
        value:
          review.description.length > 500
            ? `${review.description.slice(0, 497)}…`
            : review.description,
        inline: false,
      },
    );

  if (review.language) {
    embed.addFields({ name: '💻 Language', value: review.language, inline: true });
  }

  embed.addFields(
    {
      name: '👤 Requester',
      value: requesterTag
        ? `<@${review.requester_id}> (${requesterTag})`
        : `<@${review.requester_id}>`,
      inline: true,
    },
    { name: '📊 Status', value: STATUS_LABELS[review.status] ?? review.status, inline: true },
  );

  if (review.reviewer_id) {
    embed.addFields({
      name: '🔍 Reviewer',
      value: reviewerTag ? `<@${review.reviewer_id}> (${reviewerTag})` : `<@${review.reviewer_id}>`,
      inline: true,
    });
  }

  if (review.feedback) {
    embed.addFields({
      name: '💬 Feedback',
      value: review.feedback.length > 500 ? `${review.feedback.slice(0, 497)}…` : review.feedback,
      inline: false,
    });
  }

  embed.setTimestamp(new Date(review.created_at));
  embed.setFooter({ text: `Review #${review.id}` });

  return embed;
}

/**
 * Build the claim button action row.
 *
 * @param {number} reviewId
 * @param {boolean} [disabled=false] - Whether to disable the button
 * @returns {ActionRowBuilder}
 */
export function buildClaimButton(reviewId, disabled = false) {
  const button = new ButtonBuilder()
    .setCustomId(`review_claim_${reviewId}`)
    .setLabel('🔍 Claim')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(disabled);

  return new ActionRowBuilder().addComponents(button);
}

/**
 * Update the embed for a review (after claim or complete).
 *
 * @param {object} review - Updated review row
 * @param {import('discord.js').Client} client
 */
export async function updateReviewMessage(review, client) {
  if (!review.message_id || !review.channel_id) return;

  try {
    const channel = await client.channels.fetch(review.channel_id).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(review.message_id).catch(() => null);
    if (!message) return;

    const disabled = review.status !== 'open';
    const embed = buildReviewEmbed(review);
    const row = buildClaimButton(review.id, disabled);

    await message.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    warn('Failed to update review embed', { reviewId: review.id, error: err.message });
  }
}

/**
 * Handle a review_claim_<id> button interaction.
 *
 * @param {import('discord.js').ButtonInteraction} interaction
 */
export async function handleReviewClaim(interaction) {
  const reviewId = Number.parseInt(interaction.customId.replace('review_claim_', ''), 10);
  if (Number.isNaN(reviewId)) return;

  const pool = getPool();
  if (!pool) {
    await safeReply(interaction, { content: '❌ Database is not available.', ephemeral: true });
    return;
  }

  // Fetch review (needed for self-claim check before attempting atomic claim)
  const { rows } = await pool.query('SELECT * FROM reviews WHERE id = $1 AND guild_id = $2', [
    reviewId,
    interaction.guildId,
  ]);

  if (rows.length === 0) {
    await safeReply(interaction, {
      content: `❌ Review **#${reviewId}** not found.`,
      ephemeral: true,
    });
    return;
  }

  const review = rows[0];

  // Prevent self-claim
  if (review.requester_id === interaction.user.id) {
    await safeReply(interaction, {
      content: '❌ You cannot claim your own review request.',
      ephemeral: true,
    });
    warn('Self-claim attempt blocked', {
      reviewId,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });
    return;
  }

  // Atomic claim: only succeeds if the review is still 'open' at the moment of UPDATE.
  // This prevents two simultaneous clicks both succeeding (TOCTOU race condition).
  const { rowCount } = await pool.query(
    `UPDATE reviews
     SET reviewer_id = $1, status = 'claimed', claimed_at = NOW()
     WHERE id = $2 AND guild_id = $3 AND status = 'open'`,
    [interaction.user.id, reviewId, interaction.guildId],
  );

  if (rowCount === 0) {
    // Either the review was already claimed/completed/stale between our SELECT and here,
    // or it has gone stale. Surface a clean message either way.
    await safeReply(interaction, {
      content: '❌ This review is no longer available.',
      ephemeral: true,
    });
    return;
  }

  // Fetch the freshly-updated row so we have accurate data for the embed.
  const { rows: updatedRows } = await pool.query('SELECT * FROM reviews WHERE id = $1', [reviewId]);

  const claimedReview = updatedRows[0];

  // Optionally create a discussion thread
  let threadId = null;
  try {
    if (interaction.message.channel?.threads) {
      const thread = await interaction.message.startThread({
        name: `Review #${reviewId} Discussion`,
        autoArchiveDuration: 1440, // 24 hours
      });
      threadId = thread.id;
      await safeSend(thread, {
        content: `🔍 **Review #${reviewId}** has been claimed by <@${interaction.user.id}>!\n\nUse this thread to discuss the code. When done, run \`/review complete ${reviewId}\`.`,
      });
    }
  } catch (threadErr) {
    warn('Failed to create review discussion thread', {
      reviewId,
      error: threadErr.message,
    });
  }

  // Store thread ID if created
  if (threadId) {
    await pool.query('UPDATE reviews SET thread_id = $1 WHERE id = $2', [threadId, reviewId]);
    claimedReview.thread_id = threadId;
  }

  // Update the original embed
  await updateReviewMessage(claimedReview, interaction.client);

  info('Review claimed', {
    reviewId,
    reviewerId: interaction.user.id,
    guildId: interaction.guildId,
  });

  await safeReply(interaction, {
    content: `✅ You've claimed review **#${reviewId}**! Use \`/review complete ${reviewId}\` when you're done.`,
    ephemeral: true,
  });
}

/**
 * Mark open reviews older than staleAfterDays as stale and post a nudge.
 *
 * @param {import('discord.js').Client} client
 */
export async function expireStaleReviews(client) {
  const pool = getPool();
  if (!pool) return;

  try {
    // Collect all guild IDs that have open reviews so we can apply per-guild staleAfterDays.
    const { rows: openGuilds } = await pool.query(
      `SELECT DISTINCT guild_id FROM reviews WHERE status = 'open'`,
    );

    if (openGuilds.length === 0) return;

    const allStaleReviews = [];

    for (const { guild_id: guildId } of openGuilds) {
      const config = getConfig(guildId);
      const staleDays = config?.review?.staleAfterDays ?? 7;

      const { rows } = await pool.query(
        `UPDATE reviews
         SET status = 'stale'
         WHERE status = 'open'
           AND guild_id = $1
           AND created_at < NOW() - ($2 || ' days')::INTERVAL
         RETURNING *`,
        [guildId, staleDays],
      );

      allStaleReviews.push(...rows);
    }

    if (allStaleReviews.length === 0) return;

    info('Stale reviews expired', { count: allStaleReviews.length });

    // Group by guild so we can post nudges per server
    const byGuild = new Map();
    for (const review of allStaleReviews) {
      if (!byGuild.has(review.guild_id)) byGuild.set(review.guild_id, []);
      byGuild.get(review.guild_id).push(review);
    }

    for (const [guildId, reviews] of byGuild) {
      const guildConfig = getConfig(guildId);
      const reviewChannelId = guildConfig.review?.channelId;
      const staleDays = guildConfig?.review?.staleAfterDays ?? 7;
      if (!reviewChannelId) continue;

      try {
        const channel = await client.channels.fetch(reviewChannelId).catch(() => null);
        if (!channel) continue;

        const ids = reviews.map((r) => `#${r.id}`).join(', ');
        await safeSend(channel, {
          content: `⏰ The following review request${reviews.length > 1 ? 's have' : ' has'} gone stale (no reviewer after ${staleDays} days): **${ids}**\n> Re-request if you still need a review!`,
        });
      } catch (nudgeErr) {
        warn('Failed to send stale review nudge', { guildId, error: nudgeErr.message });
      }

      // Update embeds for stale reviews
      for (const review of reviews) {
        await updateReviewMessage(review, client);
      }
    }
  } catch (err) {
    warn('Stale review expiry failed', { error: err.message });
  }
}
