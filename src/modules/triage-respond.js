/**
 * Triage Response Sending
 * Discord message dispatch, moderation audit logging, and channel context fetching.
 */

import { EmbedBuilder } from 'discord.js';
import { info, error as logError, warn } from '../logger.js';
import { buildDebugEmbed, extractStats, logAiUsage } from '../utils/debugFooter.js';
import { safeSend } from '../utils/safeSend.js';
import { splitMessage } from '../utils/splitMessage.js';
import { addToHistory } from './ai.js';
import { isProtectedTarget } from './moderation.js';
import { resolveMessageId, sanitizeText } from './triage-filter.js';

/** Maximum characters to keep from fetched context messages. */
const CONTEXT_MESSAGE_CHAR_LIMIT = 500;

// ── History helpers ──────────────────────────────────────────────────────────

/**
 * Log an assistant message (or multiple messages when safeSend splits into an array)
 * to conversation history.
 *
 * `safeSend` can return either a single Message object or an array of Message objects
 * when the content was split across multiple Discord messages. Both cases are handled
 * here so history is never silently dropped.
 *
 * @param {string} channelId - The channel the message was sent in.
 * @param {string|null} guildId - The guild ID, or null for DMs.
 * @param {string} fallbackContent - Text to use when the sent message has no `.content`.
 * @param {import('discord.js').Message|import('discord.js').Message[]|null} sentMsg - Return value of safeSend.
 */
function logAssistantHistory(channelId, guildId, fallbackContent, sentMsg) {
  const sentMessages = Array.isArray(sentMsg) ? sentMsg : [sentMsg];
  for (const m of sentMessages) {
    if (!m?.id) continue;
    addToHistory(channelId, 'assistant', m.content || fallbackContent, null, m.id, guildId || null);
  }
}

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
 * Send a structured moderation audit embed to the configured moderation log channel.
 *
 * If no moderation log channel is configured or the channel cannot be fetched, the function exits without action.
 * Errors encountered while sending the embed are caught and ignored so they do not interrupt triage flow.
 *
 * @param {import('discord.js').Client} client - Discord client used to fetch the log channel.
 * @param {Object} classification - Parsed classifier output containing fields like `recommendedAction`, `violatedRule`, `reasoning`, and `targetMessageIds`.
 * @param {Array<Object>} snapshot - Recent message buffer entries; used to find messages referenced by `classification.targetMessageIds`.
 * @param {string} channelId - ID of the source channel where the violation occurred (used in the embed's Channel field).
 * @param {Object} config - Guild configuration containing `triage.moderationLogChannel`.
 */
export async function sendModerationLog(client, classification, snapshot, channelId, config) {
  const logChannelId = config.triage?.moderationLogChannel;
  if (!logChannelId) return;

  try {
    const logChannel = await client.channels.fetch(logChannelId);
    if (!logChannel) return;

    // Find target messages from the snapshot
    const targets = snapshot.filter((m) => classification.targetMessageIds?.includes(m.messageId));

    // Skip moderation log if any flagged user is a protected role (admin/mod/owner)
    const guild = logChannel.guild;
    if (guild && targets.length > 0 && config.moderation?.protectRoles?.enabled !== false) {
      const seenUserIds = new Set();
      for (const t of targets) {
        if (seenUserIds.has(t.userId)) continue;
        seenUserIds.add(t.userId);
        try {
          const member = await guild.members.fetch(t.userId);
          if (isProtectedTarget(member, guild, config)) {
            warn('Triage skipped moderation log: target is a protected role', {
              userId: t.userId,
              channelId,
            });
            return;
          }
        } catch {
          // Member not in guild or fetch failed — proceed with logging
        }
      }
    }

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
 * Send triage or moderation responses to a Discord channel as plain text, optionally attaching a debug embed.
 *
 * When the classification indicates moderation, moderation responses are sent if enabled; otherwise standard responses
 * are sent and the bot will attempt to reply to the target message(s). If debug footer is enabled in triage config and
 * stats are provided, a debug embed is attached to the first message chunk.
 *
 * @param {import('discord.js').TextChannel|null} channel - Resolved channel to send to; function exits if null.
 * @param {Object} parsed - Parsed responder output; expected to contain a `responses` array of { response, targetMessageId, targetUser } entries.
 * @param {Object} classification - Classifier output; `classification.classification` determines moderation vs normal flow and `classification.reasoning` is used for logging.
 * @param {Array} snapshot - Buffer snapshot used to resolve message references for replies.
 * @param {Object} config - Bot configuration; uses `config.triage` for debug/footer and moderationResponse settings.
 * @param {Object} [stats] - Optional stats used to build the debug embed (classify/respond stats and optional searchCount).
 * @param {string} [channelId] - Channel ID fallback used for logging when `channel` is not available.
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
              const sentMsg = await safeSend(channel, msgOpts);
              logAssistantHistory(channelId, channel.guild?.id || null, chunks[i], sentMsg);
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
        const sentMsg = await safeSend(channel, msgOpts);
        // Log AI response to conversation history
        logAssistantHistory(channelId, channel.guild?.id || null, chunks[i], sentMsg);
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
 * Construct per-invocation AI usage statistics and initiate analytics logging.
 *
 * @param {Object} classifyMessage - Raw classifier SDK response used to derive classification stats.
 * @param {Object} respondMessage - Raw responder SDK response used to derive response-generation stats.
 * @param {Object} resolved - Resolved triage configuration containing model identifiers (e.g., classifyModel, respondModel).
 * @param {Array<Object>} snapshot - Recent message buffer snapshot; used to locate the target message/user.
 * @param {Object} classification - Parsed classification result containing targetMessageIds and reasoning.
 * @param {number} searchCount - Number of web searches performed during response generation.
 * @param {import('discord.js').Client} client - Discord client used to fetch the channel.
 * @param {string} channelId - ID of the channel where the evaluation occurred.
 * @returns {{stats: {classify: Object, respond: Object, userId: string|null, searchCount: number}, channel: import('discord.js').Channel|null}} Stats object and the fetched channel (or null if unavailable).
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
