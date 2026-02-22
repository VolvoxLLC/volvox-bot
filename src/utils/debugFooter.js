/**
 * Debug Footer Utility
 * Builds debug stats embeds for AI responses and logs usage analytics.
 */

import { EmbedBuilder } from 'discord.js';
import { getPool } from '../db.js';
import { error as logError } from '../logger.js';

/** Debug embed accent color (Discord dark gray — blends into dark theme). */
const EMBED_COLOR = 0x2b2d31;

/**
 * Format a token count for display.
 * Raw number when <1000, `X.XK` for ≥1000.
 *
 * @param {number} tokens - Token count
 * @returns {string} Formatted token string
 */
function formatTokens(tokens) {
  if (tokens == null || tokens < 0) return '0';
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1)}K`;
}

/**
 * Format a USD cost for display.
 *
 * @param {number} cost - Cost in USD
 * @returns {string} Formatted cost string (e.g. "$0.021")
 */
function formatCost(cost) {
  if (cost == null || cost <= 0) return '$0.000';
  if (cost < 0.001) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

/**
 * Shorten a model name by removing the `claude-` prefix.
 *
 * @param {string} model - Full model name (e.g. "claude-haiku-4-5")
 * @returns {string} Short name (e.g. "haiku-4-5")
 */
function shortModel(model) {
  if (!model) return 'unknown';
  return model.replace(/^claude-/, '');
}

/**
 * Extract stats from a CLIProcess result message.
 *
 * @param {Object} result - CLIProcess send() result
 * @param {string} model - Model name used
 * @returns {Object} Normalized stats object
 */
function extractStats(result, model) {
  const usage = result?.usage || {};
  return {
    model: model || 'unknown',
    cost: result?.total_cost_usd || 0,
    durationMs: result?.duration_ms || 0,
    inputTokens: usage.input_tokens ?? usage.inputTokens ?? 0,
    outputTokens: usage.output_tokens ?? usage.outputTokens ?? 0,
    cacheCreation: usage.cache_creation_input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
  };
}

// ── Text footer builders (used by buildDebugFooter) ─────────────────────────

/**
 * Build a verbose debug footer.
 */
function buildVerbose(classify, respond) {
  const totalCost = classify.cost + respond.cost;
  const totalDuration = ((classify.durationMs + respond.durationMs) / 1000).toFixed(1);

  const lines = [
    `🔍 Triage: ${classify.model}`,
    `   In: ${formatTokens(classify.inputTokens)} Out: ${formatTokens(classify.outputTokens)} Cache+: ${formatTokens(classify.cacheCreation)} CacheR: ${formatTokens(classify.cacheRead)} Cost: ${formatCost(classify.cost)}`,
    `💬 Response: ${respond.model}`,
    `   In: ${formatTokens(respond.inputTokens)} Out: ${formatTokens(respond.outputTokens)} Cache+: ${formatTokens(respond.cacheCreation)} CacheR: ${formatTokens(respond.cacheRead)} Cost: ${formatCost(respond.cost)}`,
    `Σ Total: ${formatCost(totalCost)} • Duration: ${totalDuration}s`,
  ];
  return lines.join('\n');
}

/**
 * Build a two-line split debug footer.
 */
function buildSplit(classify, respond) {
  const totalCost = classify.cost + respond.cost;

  return [
    `🔍 Triage: ${shortModel(classify.model)} • ${formatTokens(classify.inputTokens)}→${formatTokens(classify.outputTokens)} tok • ${formatCost(classify.cost)}`,
    `💬 Response: ${shortModel(respond.model)} • ${formatTokens(respond.inputTokens)}→${formatTokens(respond.outputTokens)} tok • ${formatCost(respond.cost)} • Σ ${formatCost(totalCost)}`,
  ].join('\n');
}

/**
 * Build a single-line compact debug footer.
 */
function buildCompact(classify, respond) {
  const totalCost = classify.cost + respond.cost;

  return `🔍 ${shortModel(classify.model)} ${formatTokens(classify.inputTokens)}/${formatTokens(classify.outputTokens)} ${formatCost(classify.cost)} │ 💬 ${shortModel(respond.model)} ${formatTokens(respond.inputTokens)}/${formatTokens(respond.outputTokens)} ${formatCost(respond.cost)} │ Σ ${formatCost(totalCost)}`;
}

/**
 * Build a debug stats footer string for AI responses.
 * Text-only version — used for logging and backward compatibility.
 *
 * @param {Object} classifyStats - Stats from classifier CLIProcess result
 * @param {Object} respondStats - Stats from responder CLIProcess result
 * @param {string} [level="verbose"] - Density level: "verbose", "compact", or "split"
 * @returns {string} Formatted footer string
 */
export function buildDebugFooter(classifyStats, respondStats, level = 'verbose') {
  const defaults = {
    model: 'unknown',
    cost: 0,
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreation: 0,
    cacheRead: 0,
  };
  const classify = { ...defaults, ...classifyStats };
  const respond = { ...defaults, ...respondStats };

  switch (level) {
    case 'compact':
      return buildCompact(classify, respond);
    case 'split':
      return buildSplit(classify, respond);
    default:
      return buildVerbose(classify, respond);
  }
}

// ── Embed field builders (used by buildDebugEmbed) ──────────────────────────

/**
 * Build verbose embed fields — 2 inline fields with multi-line values.
 */
function buildVerboseFields(classify, respond) {
  return [
    {
      name: `🔍 ${shortModel(classify.model)}`,
      value: `${formatTokens(classify.inputTokens)}→${formatTokens(classify.outputTokens)} tok\nCache: ${formatTokens(classify.cacheCreation)}+${formatTokens(classify.cacheRead)}\n${formatCost(classify.cost)}`,
      inline: true,
    },
    {
      name: `💬 ${shortModel(respond.model)}`,
      value: `${formatTokens(respond.inputTokens)}→${formatTokens(respond.outputTokens)} tok\nCache: ${formatTokens(respond.cacheCreation)}+${formatTokens(respond.cacheRead)}\n${formatCost(respond.cost)}`,
      inline: true,
    },
  ];
}

/**
 * Build compact embed description — 2-line string, no fields.
 */
function buildCompactDescription(classify, respond) {
  return [
    `🔍 ${shortModel(classify.model)} ${formatTokens(classify.inputTokens)}→${formatTokens(classify.outputTokens)} ${formatCost(classify.cost)}`,
    `💬 ${shortModel(respond.model)} ${formatTokens(respond.inputTokens)}→${formatTokens(respond.outputTokens)} ${formatCost(respond.cost)}`,
  ].join('\n');
}

/**
 * Build split embed fields — 2 inline fields with single-line values.
 */
function buildSplitFields(classify, respond) {
  return [
    {
      name: `🔍 ${shortModel(classify.model)}`,
      value: `${formatTokens(classify.inputTokens)}→${formatTokens(classify.outputTokens)} • ${formatCost(classify.cost)}`,
      inline: true,
    },
    {
      name: `💬 ${shortModel(respond.model)}`,
      value: `${formatTokens(respond.inputTokens)}→${formatTokens(respond.outputTokens)} • ${formatCost(respond.cost)}`,
      inline: true,
    },
  ];
}

/**
 * Build a debug embed with structured fields for AI response stats.
 *
 * @param {Object} classifyStats - Stats from classifier CLIProcess result
 * @param {Object} respondStats - Stats from responder CLIProcess result
 * @param {string} [level="verbose"] - Density level: "verbose", "compact", or "split"
 * @returns {EmbedBuilder} Discord embed with debug stats fields
 */
export function buildDebugEmbed(classifyStats, respondStats, level = 'verbose') {
  const defaults = {
    model: 'unknown',
    cost: 0,
    durationMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreation: 0,
    cacheRead: 0,
  };
  const classify = { ...defaults, ...classifyStats };
  const respond = { ...defaults, ...respondStats };

  const totalCost = classify.cost + respond.cost;
  const totalDuration = ((classify.durationMs + respond.durationMs) / 1000).toFixed(1);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setFooter({ text: `Σ ${formatCost(totalCost)} • ${totalDuration}s` });

  if (level === 'compact') {
    embed.setDescription(buildCompactDescription(classify, respond));
  } else {
    const fields =
      level === 'split'
        ? buildSplitFields(classify, respond)
        : buildVerboseFields(classify, respond);
    embed.addFields(fields);
  }

  return embed;
}

// ── AI usage analytics ──────────────────────────────────────────────────────

/**
 * Log AI usage stats to the database (fire-and-forget).
 * Writes two rows: one for classify, one for respond.
 * Silently skips if the database pool is not available.
 *
 * @param {string} guildId - Discord guild ID
 * @param {string} channelId - Discord channel ID
 * @param {Object} stats - Stats object with classify and respond sub-objects
 */
export function logAiUsage(guildId, channelId, stats) {
  let pool;
  try {
    pool = getPool();
  } catch {
    return;
  }

  const sql = `INSERT INTO ai_usage (guild_id, channel_id, type, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd, duration_ms) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

  const c = stats?.classify || {};
  const r = stats?.respond || {};

  pool
    .query(sql, [
      guildId || 'unknown',
      channelId,
      'classify',
      c.model || 'unknown',
      c.inputTokens || 0,
      c.outputTokens || 0,
      c.cacheCreation || 0,
      c.cacheRead || 0,
      c.cost || 0,
      c.durationMs || 0,
    ])
    .catch((err) => logError('Failed to log AI usage (classify)', { error: err?.message }));

  pool
    .query(sql, [
      guildId || 'unknown',
      channelId,
      'respond',
      r.model || 'unknown',
      r.inputTokens || 0,
      r.outputTokens || 0,
      r.cacheCreation || 0,
      r.cacheRead || 0,
      r.cost || 0,
      r.durationMs || 0,
    ])
    .catch((err) => logError('Failed to log AI usage (respond)', { error: err?.message }));
}

export { extractStats, formatCost, formatTokens, shortModel };
