/**
 * Triage Response Sending
 * Discord message dispatch, moderation audit logging, and channel context fetching.
 */

import { EmbedBuilder } from 'discord.js';
import { isMessageTypeEligible } from './triage-config.js';
import { info, error as logError, warn } from '../logger.js';
import { buildDebugEmbed, extractStats, logAiUsage } from '../utils/debugFooter.js';
import { fetchChannelCached } from '../utils/discordCache.js';
import { parseProviderModel } from '../utils/modelString.js';
import { safeSend } from '../utils/safeSend.js';
import { splitMessage } from '../utils/splitMessage.js';
import { addToHistory } from './ai.js';
import { isProtectedTarget } from './moderation.js';
import { resolveMessageId, sanitizeText } from './triage-filter.js';

/** Maximum characters to keep from fetched context messages. */
const CONTEXT_MESSAGE_CHAR_LIMIT = 500;

// ── History helpers ──────────────────────────────────────────────────────────

/**
 * Record one or more assistant messages into conversation history.
 *
 * For each sent Discord message with a valid `id`, adds an "assistant" entry
 * using the message content (or `fallbackContent` when empty) and the
 * message's author id. Handles either a single Message, an array of Messages,
 * or `null`; entries without an `id` are ignored.
 *
 * @param {string} channelId - The channel the message was sent in.
 * @param {string|null} guildId - The guild ID, or `null` for DMs.
 * @param {string} fallbackContent - Text to use when a sent message has no `.content`.
 * @param {import('discord.js').Message|import('discord.js').Message[]|null} sentMsg - The result from `safeSend`: a Message, an array of Messages, or `null`.
 */
function logAssistantHistory(channelId, guildId, fallbackContent, sentMsg) {
  const sentMessages = Array.isArray(sentMsg) ? sentMsg : [sentMsg];
  for (const m of sentMessages) {
    if (!m?.id) continue;
    addToHistory(
      channelId,
      'assistant',
      m.content || fallbackContent,
      null,
      m.id,
      guildId || null,
      m.author?.id ?? null,
    );
  }
}

// ── Channel context fetching ─────────────────────────────────────────────────

/**
 * Retrieve recent channel messages to provide additional conversation context.
 *
 * Returns an array of context message objects in chronological order. Each object contains:
 * - `author`: display name (appended with " [BOT]" for bot accounts),
 * - `content`: sanitized message text truncated to the context character limit,
 * - `userId`, `messageId`, `timestamp`,
 * - `isContext`: true,
 * - `channelName`, `channelTopic`.
 *
 * Bot and webhook messages are filtered from context by default. Use `config.triage.includeBotsInContext`
 * to include bot messages, or `config.triage.botAllowlist` to include specific bot IDs.
 *
 * @param {string} channelId - ID of the channel to fetch history from.
 * @param {import('discord.js').Client} client - Discord client used to access the channel messages API.
 * @param {Array} bufferSnapshot - Current buffer snapshot; messages are fetched before the oldest entry if present.
 * @param {number} [limit=15] - Maximum number of messages to fetch.
 * @param {Object} [config] - Optional config object; when provided, used to determine bot filtering behavior.
 * @returns {Promise<Array<Object>>} Context message objects in chronological order.
 */
export async function fetchChannelContext(channelId, client, bufferSnapshot, limit = 15, config) {
  try {
    const channel = await fetchChannelCached(client, channelId);
    if (!channel?.messages) {
      warn('Channel fetch returned no messages API', { channelId });
      return [];
    }

    // Determine bot filtering behavior from config
    const includeBotsInContext = config?.triage?.includeBotsInContext ?? false;
    const botAllowlist = new Set(config?.triage?.botAllowlist ?? []);

    const toContextEntry = (m) => ({
      author: m.author.bot ? `${m.author.username} [BOT]` : m.author.username,
      content: sanitizeText(m.content?.slice(0, CONTEXT_MESSAGE_CHAR_LIMIT)) || '',
      userId: m.author.id,
      messageId: m.id,
      timestamp: m.createdTimestamp,
      isContext: true, // marker to distinguish from triage targets
      channelName: channel.name ?? null,
      channelTopic: channel.topic ?? null,
    });

    /**
     * Determine if a message should be included in context.
     * Mirrors accumulateMessage() guards: default/reply only, no webhooks, bots filtered by config.
     */
    const shouldIncludeInContext = (m) => {
      // Skip webhooks and system messages (joins, boosts, pins, etc.)
      if (!isMessageTypeEligible(m)) return false;

      // Filter bot messages based on config
      if (m.author.bot) {
        // Include if globally enabled or bot is in allowlist
        return includeBotsInContext || botAllowlist.has(m.author.id);
      }

      return true;
    };

    // Fetch historical context + recent messages in parallel.
    // When the buffer is empty we have no `before` anchor, so the history
    // fetch already returns the most recent messages — skip the redundant
    // second fetch in that case.
    const oldest = bufferSnapshot[0];
    const historyOptions = { limit };
    if (oldest) historyOptions.before = oldest.messageId;
    const RECENT_LIMIT = 5;

    const fetchPromises = [channel.messages.fetch(historyOptions)];
    if (oldest) fetchPromises.push(channel.messages.fetch({ limit: RECENT_LIMIT }));
    const fetchResults = await Promise.all(fetchPromises);
    const historyFetched = fetchResults[0];
    const recentFetched = fetchResults[1] ?? new Map();

    // Merge and deduplicate by messageId, excluding messages already in the buffer
    const bufferIds = new Set(bufferSnapshot.map((m) => m.messageId));
    const seen = new Set();
    const merged = [];

    for (const m of [...historyFetched.values(), ...recentFetched.values()]) {
      if (bufferIds.has(m.id) || seen.has(m.id)) continue;
      // Apply bot/webhook filtering
      if (!shouldIncludeInContext(m)) continue;
      seen.add(m.id);
      merged.push(m);
    }

    return merged
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp) // chronological
      .map(toContextEntry);
  } catch (err) {
    warn('fetchChannelContext failed', { channelId, error: err.message });
    return []; // channel inaccessible -- proceed without context
  }
}

// ── Moderation audit log ─────────────────────────────────────────────────────

/**
 * Send a moderation audit embed to the configured moderation log channel
 * summarizing the classification and flagged messages.
 *
 * If no moderation log channel is configured or the channel cannot be fetched,
 * the function exits without action. Errors encountered while sending the embed
 * are caught and ignored so the triage flow continues.
 *
 * @param {import('discord.js').Client} client - Discord client used to fetch the log channel.
 * @param {Object} classification - Classifier output containing fields such as `recommendedAction`, `violatedRule`, `reasoning`, and `targetMessageIds`.
 * @param {Array<Object>} snapshot - Recent message buffer entries used to locate messages referenced by `classification.targetMessageIds`.
 * @param {string} channelId - ID of the source channel where the flagged content originated (included in the embed).
 * @param {Object} config - Guild configuration containing `triage.moderationLogChannel` and any moderation protections.
 * @param {string|null} guildId - Guild ID used when resolving the moderation log channel; may be `null` for DMs.
 */
export async function sendModerationLog(
  client,
  classification,
  snapshot,
  channelId,
  config,
  guildId,
) {
  const logChannelId = config.triage?.moderationLogChannel;
  if (!logChannelId) return;

  try {
    const logChannel = await fetchChannelCached(client, logChannelId, guildId);
    if (!logChannel) return;

    // Find target messages from the snapshot
    const targets = snapshot.filter((m) => classification.targetMessageIds?.includes(m.messageId));

    // Skip if any target is a protected role (admin/mod)
    if (config.moderation?.protectRoles?.enabled && logChannel.guild) {
      for (const t of targets) {
        const member = await logChannel.guild.members.fetch(t.userId).catch(() => null);
        if (member && isProtectedTarget(member, logChannel.guild)) {
          warn('Skipping moderation log for protected role target', {
            guildId,
            channelId,
            userId: t.userId,
          });
          return;
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
    warn('Failed to send moderation audit log', { guildId, channelId, error: err.message });
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
 * @returns {Promise<boolean>} `true` if at least one message was sent, `false` otherwise.
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
    return false;
  }

  channelId = channelId || channel.id;
  const triageConfig = config.triage || {};
  const type = classification.classification;
  const allResponses = parsed.responses || [];

  // Cap responses per evaluation to prevent rapid-fire bot messages.
  // Moderation responses are exempt — all flagged violations get in-channel nudges.
  const maxResponses = triageConfig.maxResponsesPerEval ?? 2;
  const responses = type === 'moderate' ? allResponses : allResponses.slice(0, maxResponses);
  if (type !== 'moderate' && allResponses.length > maxResponses) {
    warn('Response count capped', {
      channelId,
      produced: allResponses.length,
      capped: maxResponses,
    });
  }

  // Build debug embed if enabled
  let debugEmbed;
  if (triageConfig.debugFooter && stats) {
    const level = triageConfig.debugFooterLevel || 'verbose';
    debugEmbed = buildDebugEmbed(stats.classify, stats.respond, level, {
      searchCount: stats.searchCount,
    });
  }

  let sent = false;

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
              sent = true;
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
    return sent;
  }

  // respond or chime-in
  if (responses.length === 0) {
    warn('Triage generated no responses for classification', { channelId, classification: type });
    return false;
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
        sent = true;
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

  return sent;
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

  const { providerName: classifyProvider } = parseProviderModel(resolved.classifyModel);
  const { providerName: respondProvider } = parseProviderModel(resolved.respondModel);

  const stats = {
    classify: extractStats(classifyMessage, resolved.classifyModel, classifyProvider),
    respond: extractStats(respondMessage, resolved.respondModel, respondProvider),
    userId: targetUserId,
    searchCount,
  };

  // Fetch channel once for guildId resolution + passing to sendResponses
  const channel = await fetchChannelCached(client, channelId).catch(() => null);
  const guildId = channel?.guildId;

  // Log AI usage analytics (fire-and-forget)
  logAiUsage(guildId, channelId, stats);

  return { stats, channel };
}
