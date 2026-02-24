/**
 * Triage Response Sending
 * Discord message dispatch, moderation audit logging, and channel context fetching.
 */

import { EmbedBuilder } from 'discord.js';
import { info, error as logError, warn } from '../logger.js';
import { buildDebugEmbed, extractStats, logAiUsage } from '../utils/debugFooter.js';
import { safeSend } from '../utils/safeSend.js';
import { splitMessage } from '../utils/splitMessage.js';
import { resolveMessageId, sanitizeText } from './triage-filter.js';

/** Maximum characters to keep from fetched context messages. */
const CONTEXT_MESSAGE_CHAR_LIMIT = 500;

// ── Channel context fetching ─────────────────────────────────────────────────

/**
 * Fetch recent messages from Discord's API to provide conversation context
 * beyond the buffer window. Called at evaluation time (not accumulation) to
 * minimize API calls.
 *
 * @param {string} channelId - The channel to fetch history from
 * @param {import('discord.js').Client} client - Discord client
 * @param {Array} bufferSnapshot - Current buffer snapshot (to fetch messages before)
 * @param {number} [limit=15] - Maximum messages to fetch
 * @returns {Promise<Array>} Context messages in chronological order
 */
export async function fetchChannelContext(channelId, client, bufferSnapshot, limit = 15) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.messages) {
      warn('Channel fetch returned no messages API', { channelId });
      return [];
    }

    // Fetch messages before the oldest buffered message
    const oldest = bufferSnapshot[0];
    const options = { limit };
    if (oldest) options.before = oldest.messageId;

    const fetched = await channel.messages.fetch(options);
    return [...fetched.values()]
      .reverse() // chronological order
      .map((m) => ({
        author: m.author.bot ? `${m.author.username} [BOT]` : m.author.username,
        content: sanitizeText(m.content?.slice(0, CONTEXT_MESSAGE_CHAR_LIMIT)) || '',
        userId: m.author.id,
        messageId: m.id,
        timestamp: m.createdTimestamp,
        isContext: true, // marker to distinguish from triage targets
      }));
  } catch (err) {
    warn('fetchChannelContext failed', { channelId, error: err.message });
    return []; // channel inaccessible -- proceed without context
  }
}

// ── Moderation audit log ─────────────────────────────────────────────────────

/**
 * Send a structured audit embed to the moderation log channel.
 * Fire-and-forget -- failures are logged but never block the warning flow.
 *
 * @param {import('discord.js').Client} client - Discord client
 * @param {Object} classification - Parsed classifier output
 * @param {Array} snapshot - Buffer snapshot
 * @param {string} channelId - Source channel where the violation occurred
 * @param {Object} config - Bot configuration
 */
export async function sendModerationLog(client, classification, snapshot, channelId, config) {
  const logChannelId = config.triage?.moderationLogChannel;
  if (!logChannelId) return;

  try {
    const logChannel = await client.channels.fetch(logChannelId);
    if (!logChannel) return;

    // Find target messages from the snapshot
    const targets = snapshot.filter((m) => classification.targetMessageIds?.includes(m.messageId));

    const actionLabels = {
      warn: '\u26A0\uFE0F Warn',
      timeout: '\uD83D\uDD07 Timeout',
      kick: '\uD83D\uDC62 Kick',
      ban: '\uD83D\uDD28 Ban',
      delete: '\uD83D\uDDD1\uFE0F Delete',
    };

    const action = classification.recommendedAction || 'unknown';
    const actionLabel = actionLabels[action] || `\u2753 ${action}`;
    const rule = classification.violatedRule || 'Unspecified';

    const embed = new EmbedBuilder()
      .setColor(0xed4245) // Discord red
      .setTitle('\uD83D\uDEE1\uFE0F Moderation Flag')
      .setDescription(classification.reasoning)
      .addFields(
        { name: 'Recommended Action', value: actionLabel, inline: true },
        { name: 'Rule Violated', value: rule, inline: true },
        { name: 'Channel', value: `<#${channelId}>`, inline: true },
      )
      .setTimestamp();

    // Add a field per flagged user with their message content
    for (const t of targets) {
      embed.addFields({
        name: `${t.author} (<@${t.userId}>)`,
        value: t.content.slice(0, 1024) || '*empty*',
        inline: false,
      });
    }

    await safeSend(logChannel, { embeds: [embed] });
  } catch (err) {
    warn('Failed to send moderation audit log', { channelId, error: err.message });
  }
}

// ── Response sending ────────────────────────────────────────────────────────

/**
 * Send parsed responses to Discord as plain text with optional debug embed.
 *
 * Response text is sent as normal message content (not inside an embed).
 * When debugFooter is enabled, a structured debug embed is attached to
 * the same message showing triage and response stats.
 *
 * @param {import('discord.js').TextChannel|null} channel - Resolved channel to send to
 * @param {Object} parsed - Parsed responder output
 * @param {Object} classification - Classifier output
 * @param {Array} snapshot - Buffer snapshot
 * @param {Object} config - Bot configuration
 * @param {Object} [stats] - Optional stats from classify/respond steps
 * @param {string} [channelId] - Channel ID fallback for logging
 */
export async function sendResponses(
  channel,
  parsed,
  classification,
  snapshot,
  config,
  stats,
  channelId,
) {
  if (!channel) {
    warn('Could not fetch channel for triage response', { channelId });
    return;
  }

  channelId = channelId || channel.id;
  const triageConfig = config.triage || {};
  const type = classification.classification;
  const responses = parsed.responses || [];

  // Build debug embed if enabled
  let debugEmbed;
  if (triageConfig.debugFooter && stats) {
    const level = triageConfig.debugFooterLevel || 'verbose';
    debugEmbed = buildDebugEmbed(stats.classify, stats.respond, level, {
      searchCount: stats.searchCount,
    });
  }

  if (type === 'moderate') {
    warn('Moderation flagged', { channelId, reasoning: classification.reasoning });

    if (triageConfig.moderationResponse !== false && responses.length > 0) {
      for (const r of responses) {
        try {
          if (r.response?.trim()) {
            const replyRef = resolveMessageId(r.targetMessageId, r.targetUser, snapshot);
            const chunks = splitMessage(r.response);
            for (let i = 0; i < chunks.length; i++) {
              const msgOpts = { content: chunks[i] };
              if (debugEmbed && i === 0) msgOpts.embeds = [debugEmbed];
              if (replyRef && i === 0) msgOpts.reply = { messageReference: replyRef };
              await safeSend(channel, msgOpts);
            }
          }
        } catch (err) {
          logError('Failed to send moderation response', {
            channelId,
            targetUser: r.targetUser,
            error: err?.message,
          });
        }
      }
    }
    return;
  }

  // respond or chime-in
  if (responses.length === 0) {
    warn('Triage generated no responses for classification', { channelId, classification: type });
    return;
  }

  await channel.sendTyping();

  for (const r of responses) {
    try {
      if (!r.response?.trim()) {
        warn('Triage generated empty response for user', { channelId, targetUser: r.targetUser });
        continue;
      }

      const replyRef = resolveMessageId(r.targetMessageId, r.targetUser, snapshot);
      const chunks = splitMessage(r.response);

      for (let i = 0; i < chunks.length; i++) {
        const msgOpts = { content: chunks[i] };
        if (debugEmbed && i === 0) msgOpts.embeds = [debugEmbed];
        if (replyRef && i === 0) msgOpts.reply = { messageReference: replyRef };
        await safeSend(channel, msgOpts);
      }

      info('Triage response sent', {
        channelId,
        classification: type,
        targetUser: r.targetUser,
        targetMessageId: r.targetMessageId,
      });
    } catch (err) {
      logError('Failed to send triage response', {
        channelId,
        targetUser: r.targetUser,
        error: err?.message,
      });
    }
  }
}

/**
 * Build stats object and log analytics for a completed evaluation.
 *
 * @param {Object} classifyMessage - Raw classifier SDK message
 * @param {Object} respondMessage - Raw responder SDK message
 * @param {Object} resolved - Resolved triage config with model names
 * @param {Array} snapshot - Buffer snapshot
 * @param {Object} classification - Parsed classification result
 * @param {number} searchCount - Number of web searches performed
 * @param {import('discord.js').Client} client - Discord client
 * @param {string} channelId - Channel ID
 * @returns {Promise<{stats: Object, channel: Object|null}>} Stats and resolved channel
 */
export async function buildStatsAndLog(
  classifyMessage,
  respondMessage,
  resolved,
  snapshot,
  classification,
  searchCount,
  client,
  channelId,
) {
  const targetEntry = snapshot.find((m) => classification.targetMessageIds?.includes(m.messageId));
  const targetUserId = targetEntry?.userId || null;

  const stats = {
    classify: extractStats(classifyMessage, resolved.classifyModel),
    respond: extractStats(respondMessage, resolved.respondModel),
    userId: targetUserId,
    searchCount,
  };

  // Fetch channel once for guildId resolution + passing to sendResponses
  const channel = await client.channels.fetch(channelId).catch(() => null);
  const guildId = channel?.guildId;

  // Log AI usage analytics (fire-and-forget)
  logAiUsage(guildId, channelId, stats);

  return { stats, channel };
}
