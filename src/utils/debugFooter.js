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
 * Shorten a model name for display. Strips a leading `provider:` prefix so
 * `minimax:MiniMax-M2.7` → `MiniMax-M2.7`. Historical `claude-` prefix
 * handling is preserved for legacy fixtures but no current catalog model
 * has one.
 *
 * @param {string} model - Full model name (e.g. `"minimax:MiniMax-M2.7"`).
 * @returns {string} Short name suitable for Discord embeds.
 */
function shortModel(model) {
  if (!model) return 'unknown';
  // Strip `provider:` prefix (e.g. `minimax:MiniMax-M2.7` → `MiniMax-M2.7`).
  const afterColon = model.includes(':') ? model.slice(model.indexOf(':') + 1) : model;
  // Legacy claude- prefix strip — kept so older log fixtures still render tidily.
  return afterColon.replace(/^claude-/, '');
}

/**
 * Normalize and aggregate usage statistics from an AI SDK result.
 *
 * @param {Object} result - Result from generate()/stream() in aiClient.js.
 * @param {string} model - Model name used for the request.
 * @param {string} providerName - Logical provider name (e.g. `'minimax'`). Required;
 *   a missing value throws so silent miscounting never ships.
 * @returns {Object} An object with normalized fields:
 *  - model {string} - Model name (or 'unknown').
 *  - cost {number} - Total cost in USD.
 *  - durationMs {number} - Duration in milliseconds.
 *  - inputTokens {number} - Total input tokens.
 *  - outputTokens {number} - Total output tokens.
 *  - cacheCreation {number} - Tokens consumed creating cache entries.
 *  - cacheRead {number} - Tokens consumed reading from cache.
 */
function extractStats(result, model, providerName) {
  if (typeof providerName !== 'string' || !providerName) {
    throw new TypeError(
      'extractStats: providerName is required (pass the logical provider name, ' +
        'e.g. the first segment of a `provider:model` string).',
    );
  }

  const usage = result?.usage || {};

  // Provider-specific cache token stats live in providerMetadata, not in usage.
  //
  // Today every catalog provider routes through `createAnthropic`, so the
  // Vercel AI SDK populates `providerMetadata.anthropic` — not a per-provider
  // bucket. Prefer the provider-keyed bucket if present (future-proofs against
  // non-anthropic SDK paths landing via #530) and fall back to the
  // anthropic-shape bucket so MiniMax/Moonshot/OpenRouter cache stats actually
  // display instead of silently reporting 0.
  const providerMeta =
    result?.providerMetadata?.[providerName] ?? result?.providerMetadata?.anthropic ?? {};

  return {
    model: model || 'unknown',
    cost: result?.costUsd ?? 0,
    durationMs: result?.durationMs ?? 0,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheCreation: providerMeta.cacheCreationInputTokens ?? 0,
    cacheRead: providerMeta.cacheReadInputTokens ?? 0,
  };
}

// ── Text footer builders (used by buildDebugFooter) ─────────────────────────

/**
 * Build a verbose debug footer.
 */
function buildVerbose(classify, respond, searchCount) {
  const totalCost = classify.cost + respond.cost;
  const totalDuration = ((classify.durationMs + respond.durationMs) / 1000).toFixed(1);

  let summary = `Σ Total: ${formatCost(totalCost)} • Duration: ${totalDuration}s`;
  if (searchCount > 0) summary += ` • 🔎×${searchCount}`;

  const lines = [
    `🔍 Triage: ${classify.model}`,
    `   In: ${formatTokens(classify.inputTokens)} Out: ${formatTokens(classify.outputTokens)} Cache+: ${formatTokens(classify.cacheCreation)} CacheR: ${formatTokens(classify.cacheRead)} Cost: ${formatCost(classify.cost)}`,
    `💬 Response: ${respond.model}`,
    `   In: ${formatTokens(respond.inputTokens)} Out: ${formatTokens(respond.outputTokens)} Cache+: ${formatTokens(respond.cacheCreation)} CacheR: ${formatTokens(respond.cacheRead)} Cost: ${formatCost(respond.cost)}`,
    summary,
  ];
  return lines.join('\n');
}

/**
 * Build a two-line split debug footer.
 */
function buildSplit(classify, respond, searchCount) {
  const totalCost = classify.cost + respond.cost;

  let totalSuffix = `Σ ${formatCost(totalCost)}`;
  if (searchCount > 0) totalSuffix += ` • 🔎×${searchCount}`;

  return [
    `🔍 Triage: ${shortModel(classify.model)} • ${formatTokens(classify.inputTokens)}→${formatTokens(classify.outputTokens)} tok • ${formatCost(classify.cost)}`,
    `💬 Response: ${shortModel(respond.model)} • ${formatTokens(respond.inputTokens)}→${formatTokens(respond.outputTokens)} tok • ${formatCost(respond.cost)} • ${totalSuffix}`,
  ].join('\n');
}

/**
 * Build a single-line compact debug footer.
 */
function buildCompact(classify, respond, searchCount) {
  const totalCost = classify.cost + respond.cost;

  let line = `🔍 ${shortModel(classify.model)} ${formatTokens(classify.inputTokens)}/${formatTokens(classify.outputTokens)} ${formatCost(classify.cost)} │ 💬 ${shortModel(respond.model)} ${formatTokens(respond.inputTokens)}/${formatTokens(respond.outputTokens)} ${formatCost(respond.cost)} │ Σ ${formatCost(totalCost)}`;
  if (searchCount > 0) line += ` │ 🔎×${searchCount}`;
  return line;
}

/**
 * Build a text-only debug footer summarizing AI usage and costs.
 *
 * @param {Object} classifyStats - Normalized stats for the classification stage.
 * @param {Object} respondStats - Normalized stats for the response generation stage.
 * @param {string} [level="verbose"] - Density level: "verbose", "compact", or "split".
 * @param {Object} [options] - Additional display options.
 * @param {number} [options.searchCount] - Number of web searches performed; included in the footer when greater than 0.
 * @return {string} The formatted footer string.
 */
export function buildDebugFooter(
  classifyStats,
  respondStats,
  level = 'verbose',
  { searchCount } = {},
) {
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
      return buildCompact(classify, respond, searchCount);
    case 'split':
      return buildSplit(classify, respond, searchCount);
    default:
      return buildVerbose(classify, respond, searchCount);
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
 * Create a Discord EmbedBuilder containing structured AI usage and cost statistics.
 *
 * Includes per-stage fields or a compact description and a footer with total cost and duration.
 *
 * @param {Object} classifyStats - Normalized stats for the classification/triage stage.
 * @param {Object} respondStats - Normalized stats for the response/generation stage.
 * @param {string} [level="verbose"] - Layout density: "verbose", "compact", or "split".
 * @param {Object} [options] - Display options.
 * @param {number} [options.searchCount] - Number of web searches performed; shown in the footer when greater than 0.
 * @returns {EmbedBuilder} An EmbedBuilder populated with fields or a compact description representing the provided stats.
 */
export function buildDebugEmbed(
  classifyStats,
  respondStats,
  level = 'verbose',
  { searchCount } = {},
) {
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

  let footerText = `Σ ${formatCost(totalCost)} • ${totalDuration}s`;
  if (searchCount > 0) footerText += ` • 🔎×${searchCount}`;

  const embed = new EmbedBuilder().setColor(EMBED_COLOR).setFooter({ text: footerText });

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
 * @param {Object} stats - Stats object with classify/respond sub-objects, userId, searchCount
 */
export function logAiUsage(guildId, channelId, stats) {
  let pool;
  try {
    pool = getPool();
  } catch {
    return;
  }

  const sql = `INSERT INTO ai_usage (guild_id, channel_id, type, model, input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, cost_usd, duration_ms, user_id, search_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`;

  const classifyStats = stats?.classify || {};
  const respondStats = stats?.respond || {};
  const userId = stats?.userId || null;
  const searchCount = stats?.searchCount || 0;

  pool
    .query(sql, [
      guildId || null,
      channelId,
      'classify',
      classifyStats.model || 'unknown',
      classifyStats.inputTokens || 0,
      classifyStats.outputTokens || 0,
      classifyStats.cacheCreation || 0,
      classifyStats.cacheRead || 0,
      classifyStats.cost || 0,
      classifyStats.durationMs || 0,
      userId,
      0,
    ])
    .catch((err) => logError('Failed to log AI usage (classify)', { error: err?.message }));

  pool
    .query(sql, [
      guildId || null,
      channelId,
      'respond',
      respondStats.model || 'unknown',
      respondStats.inputTokens || 0,
      respondStats.outputTokens || 0,
      respondStats.cacheCreation || 0,
      respondStats.cacheRead || 0,
      respondStats.cost || 0,
      respondStats.durationMs || 0,
      userId,
      searchCount,
    ])
    .catch((err) => logError('Failed to log AI usage (respond)', { error: err?.message }));
}

export { extractStats, formatCost, formatTokens, shortModel };
