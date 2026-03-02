/**
 * AI Auto-Moderation Module
 * Uses Claude SDK to analyze messages for toxicity, spam, and harassment.
 * Supports configurable thresholds, per-guild settings, and multiple actions:
 * warn, timeout, kick, ban, or flag for review.
 */

import Anthropic from '@anthropic-ai/sdk';
import { EmbedBuilder } from 'discord.js';
import { info, error as logError, warn } from '../logger.js';
import { fetchChannelCached } from '../utils/discordCache.js';
import { isExempt } from '../utils/modExempt.js';
import { safeSend } from '../utils/safeSend.js';
import { createCase } from './moderation.js';

/** Default config when none is provided */
const DEFAULTS = {
  enabled: false,
  model: 'claude-haiku-4-5',
  thresholds: {
    toxicity: 0.7,
    spam: 0.8,
    harassment: 0.7,
  },
  actions: {
    toxicity: 'flag',
    spam: 'delete',
    harassment: 'warn',
  },
  timeoutDurationMs: 5 * 60 * 1000,
  flagChannelId: null,
  autoDelete: true,
  exemptRoleIds: [],
};

/** Anthropic client (lazy initialized) */
let _client = null;

/**
 * Get or create the Anthropic client.
 * @returns {Anthropic}
 */
function getClient() {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

/**
 * Reset the Anthropic client (for testing).
 */
export function resetClient() {
  _client = null;
}

/**
 * Get the merged AI auto-mod config for a guild.
 * @param {Object} config - Guild config
 * @returns {Object} Merged AI auto-mod config
 */
export function getAiAutoModConfig(config) {
  const raw = config?.aiAutoMod ?? {};
  return {
    ...DEFAULTS,
    ...raw,
    thresholds: { ...DEFAULTS.thresholds, ...(raw.thresholds ?? {}) },
    actions: { ...DEFAULTS.actions, ...(raw.actions ?? {}) },
  };
}

/**
 * Analyze a message using Claude AI.
 * Returns scores and recommendations for moderation actions.
 *
 * @param {string} content - Message content to analyze
 * @param {Object} autoModConfig - AI auto-mod config
 * @returns {Promise<{flagged: boolean, scores: Object, categories: string[], reason: string, action: string}>}
 */
export async function analyzeMessage(content, autoModConfig) {
  const cfg = autoModConfig ?? DEFAULTS;

  if (!content || content.trim().length < 3) {
    return {
      flagged: false,
      scores: { toxicity: 0, spam: 0, harassment: 0 },
      categories: [],
      reason: 'Message too short',
      action: 'none',
    };
  }

  const client = getClient();

  const prompt = `You are a content moderation assistant. Analyze the following Discord message and rate it on three dimensions.

Message to analyze:
<message>
${content.slice(0, 2000)}
</message>

Rate the message on a scale of 0.0 to 1.0 for each category:
- toxicity: Hateful language, slurs, extreme negativity targeting groups or individuals
- spam: Repetitive content, advertisements, scam links, flooding
- harassment: Targeted attacks on specific individuals, threats, bullying, doxxing

Respond ONLY with valid JSON in this exact format:
{
  "toxicity": 0.0,
  "spam": 0.0,
  "harassment": 0.0,
  "reason": "brief explanation of main concern or 'clean' if none"
}`;

  const response = await client.messages.create({
    model: cfg.model ?? DEFAULTS.model,
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text ?? '{}';

  let parsed;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    logError('AI auto-mod: failed to parse Claude response', { text });
    return {
      flagged: false,
      scores: { toxicity: 0, spam: 0, harassment: 0 },
      categories: [],
      reason: 'Parse error',
      action: 'none',
    };
  }

  const scores = {
    toxicity: Math.min(1, Math.max(0, Number(parsed.toxicity) || 0)),
    spam: Math.min(1, Math.max(0, Number(parsed.spam) || 0)),
    harassment: Math.min(1, Math.max(0, Number(parsed.harassment) || 0)),
  };

  const thresholds = cfg.thresholds;
  const triggeredCategories = [];

  if (scores.toxicity >= thresholds.toxicity) triggeredCategories.push('toxicity');
  if (scores.spam >= thresholds.spam) triggeredCategories.push('spam');
  if (scores.harassment >= thresholds.harassment) triggeredCategories.push('harassment');

  const flagged = triggeredCategories.length > 0;

  const actionPriority = { ban: 5, kick: 4, timeout: 3, warn: 2, delete: 2, flag: 1, none: -1 };
  let action = 'none';
  for (const cat of triggeredCategories) {
    const catAction = cfg.actions[cat] ?? 'flag';
    if ((actionPriority[catAction] ?? 0) > (actionPriority[action] ?? -1)) {
      action = catAction;
    }
  }

  return {
    flagged,
    scores,
    categories: triggeredCategories,
    reason: parsed.reason ?? 'No reason provided',
    action,
  };
}

/**
 * Send a flag embed to the moderation review channel.
 *
 * @param {import('discord.js').Message} message - The flagged Discord message
 * @param {import('discord.js').Client} client - Discord client
 * @param {Object} result - Analysis result
 * @param {Object} autoModConfig - AI auto-mod config
 */
async function sendFlagEmbed(message, client, result, autoModConfig) {
  const channelId = autoModConfig.flagChannelId;
  if (!channelId) return;

  const flagChannel = await fetchChannelCached(client, channelId).catch(() => null);
  if (!flagChannel) return;

  const scoreBar = (score) => {
    const filled = Math.round(score * 10);
    return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${Math.round(score * 100)}%`;
  };

  const embed = new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('🤖 AI Auto-Mod Flag')
    .setDescription(`**Message flagged for review**\nAction taken: \`${result.action}\``)
    .addFields(
      { name: 'Author', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
      { name: 'Categories', value: result.categories.join(', ') || 'none', inline: true },
      { name: 'Message', value: (message.content || '*[no text]*').slice(0, 1024) },
      {
        name: 'AI Scores',
        value: [
          `Toxicity:   ${scoreBar(result.scores.toxicity)}`,
          `Spam:       ${scoreBar(result.scores.spam)}`,
          `Harassment: ${scoreBar(result.scores.harassment)}`,
        ].join('\n'),
      },
      { name: 'Reason', value: result.reason.slice(0, 512) },
      { name: 'Jump Link', value: `[View Message](${message.url})` },
    )
    .setFooter({ text: `Message ID: ${message.id}` })
    .setTimestamp();

  await safeSend(flagChannel, { embeds: [embed] });
}

/**
 * Execute the moderation action on the offending message/member.
 *
 * @param {import('discord.js').Message} message - The flagged message
 * @param {import('discord.js').Client} client - Discord client
 * @param {Object} result - Analysis result
 * @param {Object} autoModConfig - AI auto-mod config
 * @param {Object} guildConfig - Full guild config
 */
async function executeAction(message, client, result, autoModConfig, guildConfig) {
  const { member, guild } = message;

  const reason = `AI Auto-Mod: ${result.categories.join(', ')} — ${result.reason}`;
  const botId = client.user?.id ?? 'bot';
  const botTag = client.user?.tag ?? 'Bot#0000';

  if (autoModConfig.autoDelete) {
    await message.delete().catch(() => {});
  }

  switch (result.action) {
    case 'warn':
      if (!member || !guild) break;
      await createCase(guild.id, {
        action: 'warn',
        targetId: member.user.id,
        targetTag: member.user.tag,
        moderatorId: botId,
        moderatorTag: botTag,
        reason,
      }).catch((err) => logError('AI auto-mod: createCase (warn) failed', { error: err?.message }));
      break;

    case 'timeout': {
      if (!member || !guild) break;
      const durationMs = autoModConfig.timeoutDurationMs ?? DEFAULTS.timeoutDurationMs;
      await member
        .timeout(durationMs, reason)
        .catch((err) =>
          logError('AI auto-mod: timeout failed', { userId: member.user.id, error: err?.message }),
        );
      await createCase(guild.id, {
        action: 'timeout',
        targetId: member.user.id,
        targetTag: member.user.tag,
        moderatorId: botId,
        moderatorTag: botTag,
        reason,
        duration: `${durationMs}ms`,
      }).catch((err) =>
        logError('AI auto-mod: createCase (timeout) failed', { error: err?.message }),
      );
      break;
    }

    case 'kick':
      if (!member || !guild) break;
      await member
        .kick(reason)
        .catch((err) =>
          logError('AI auto-mod: kick failed', { userId: member.user.id, error: err?.message }),
        );
      await createCase(guild.id, {
        action: 'kick',
        targetId: member.user.id,
        targetTag: member.user.tag,
        moderatorId: botId,
        moderatorTag: botTag,
        reason,
      }).catch((err) => logError('AI auto-mod: createCase (kick) failed', { error: err?.message }));
      break;

    case 'ban':
      if (!member || !guild) break;
      await guild.members
        .ban(member.user.id, { reason, deleteMessageSeconds: 0 })
        .catch((err) =>
          logError('AI auto-mod: ban failed', { userId: member.user.id, error: err?.message }),
        );
      await createCase(guild.id, {
        action: 'ban',
        targetId: member.user.id,
        targetTag: member.user.tag,
        moderatorId: botId,
        moderatorTag: botTag,
        reason,
      }).catch((err) => logError('AI auto-mod: createCase (ban) failed', { error: err?.message }));
      break;

    case 'delete':
      await message.delete().catch(() => {});
      break;

    case 'flag':
    default:
      break;
  }

  await sendFlagEmbed(message, client, result, autoModConfig).catch((err) =>
    logError('AI auto-mod: sendFlagEmbed failed', { error: err?.message }),
  );
}

/**
 * Check a Discord message with AI auto-moderation.
 * Returns early (no action) for bots, exempt users, or disabled config.
 *
 * @param {import('discord.js').Message} message - Incoming Discord message
 * @param {import('discord.js').Client} client - Discord client
 * @param {Object} guildConfig - Merged guild config
 * @returns {Promise<{flagged: boolean, action?: string, categories?: string[]}>}
 */
export async function checkAiAutoMod(message, client, guildConfig) {
  const autoModConfig = getAiAutoModConfig(guildConfig);

  if (!autoModConfig.enabled) {
    return { flagged: false };
  }

  if (message.author.bot) {
    return { flagged: false };
  }

  if (isExempt(message, guildConfig)) {
    return { flagged: false };
  }

  const exemptRoleIds = autoModConfig.exemptRoleIds ?? [];
  if (exemptRoleIds.length > 0 && message.member) {
    const hasExemptRole = message.member.roles.cache.some((r) => exemptRoleIds.includes(r.id));
    if (hasExemptRole) return { flagged: false };
  }

  if (!message.content || message.content.trim().length === 0) {
    return { flagged: false };
  }

  try {
    const result = await analyzeMessage(message.content, autoModConfig);

    if (!result.flagged) {
      return { flagged: false };
    }

    warn('AI auto-mod: flagged message', {
      userId: message.author.id,
      guildId: message.guild?.id,
      categories: result.categories,
      action: result.action,
      scores: result.scores,
    });

    info('AI auto-mod: executing action', {
      action: result.action,
      userId: message.author.id,
    });

    await executeAction(message, client, result, autoModConfig, guildConfig);

    return { flagged: true, action: result.action, categories: result.categories };
  } catch (err) {
    logError('AI auto-mod: analysis failed', {
      channelId: message.channel.id,
      userId: message.author.id,
      error: err?.message,
    });
    return { flagged: false };
  }
}
