/**
 * Triage Configuration
 * Config resolution with 3-layer legacy fallback and channel eligibility checks.
 */

import { MessageType } from 'discord.js';
import { warn } from '../logger.js';
import { parseProviderModel } from '../utils/modelString.js';
import {
  DEFAULT_AI_MODEL,
  isSupportedAiModel,
  normalizeSupportedAiModel,
} from '../utils/supportedAiModels.js';

const DEFAULT_TRIAGE_MODEL = DEFAULT_AI_MODEL;

/**
 * Return `value` when it is a non-empty string AND parses as a valid
 * `provider:model` identifier. Otherwise return `undefined` so the `??` chain
 * moves to the next fallback. Bare model names (no `:`) are rejected loudly
 * via `warn` so misconfigured legacy values are visible in logs; the resolver
 * itself falls back rather than throwing so a stale guild config can't crash
 * startup.
 * @param {unknown} value
 * @param {string} origin - The key the value came from, for the warning.
 * @returns {string | undefined}
 */
function validSupportedModel(value, origin) {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    parseProviderModel(value);
  } catch (err) {
    warn('Triage config contains a legacy bare model string — falling back', {
      origin,
      value,
      reason: err?.message,
      hint: "Migrate to 'provider:model' format (e.g. 'minimax:MiniMax-M2.7').",
    });
    return undefined;
  }

  if (!isSupportedAiModel(value)) {
    warn('Triage config contains an unsupported model string — falling back', {
      origin,
      value,
      hint: 'Select one of the supported dashboard models.',
    });
    return undefined;
  }

  return normalizeSupportedAiModel(value);
}

function firstValidSupportedModel(candidates) {
  for (const [value, origin] of candidates) {
    const resolved = validSupportedModel(value, origin);
    if (resolved) return resolved;
  }
  return undefined;
}

// ── Config resolution ───────────────────────────────────────────────────────

/**
 * Resolve triage config with 3-layer legacy fallback:
 * 1. New split format: classifyModel / respondModel / classifyBudget / respondBudget
 * 2. PR #68 flat format: model / budget / timeout
 * 3. Original nested format: models.triage / models.default / budget.response / timeouts.response
 *
 * Legacy slots `models.triage` and `models.default` are also consulted so
 * upgraded guild configs don't silently lose their custom classifier.
 *
 * All resolved model values must be provider-qualified and in the supported
 * dashboard model list, so custom model strings never reach the AI client.
 *
 * @param {Object} triageConfig - Raw triage configuration object
 * @returns {Object} Resolved configuration with canonical field names
 */
export function resolveTriageConfig(triageConfig) {
  // Legacy model fields: `model` (PR #68 flat) and `models.triage` / `models.default`
  // (original nested). Keep precedence stable so behaviour is predictable:
  //   classifyModel ← classifyModel → models.triage → model → models.default → default
  //   respondModel  ← respondModel  → model → models.default → default
  const classifyModel =
    firstValidSupportedModel([
      [triageConfig.classifyModel, 'triage.classifyModel'],
      [triageConfig.models?.triage, 'triage.models.triage'],
      [triageConfig.model, 'triage.model'],
      [triageConfig.models?.default, 'triage.models.default'],
    ]) ?? DEFAULT_TRIAGE_MODEL;

  const respondModel =
    firstValidSupportedModel([
      [triageConfig.respondModel, 'triage.respondModel'],
      [triageConfig.model, 'triage.model'],
      [triageConfig.models?.default, 'triage.models.default'],
    ]) ?? DEFAULT_TRIAGE_MODEL;

  const classifyBudget = triageConfig.classifyBudget ?? 0.05;

  const respondBudget =
    triageConfig.respondBudget ??
    (typeof triageConfig.budget === 'number'
      ? triageConfig.budget
      : (triageConfig.budget?.response ?? 0.2));

  const timeout =
    typeof triageConfig.timeout === 'number'
      ? triageConfig.timeout
      : (triageConfig.timeouts?.response ?? 30000);

  const thinkingTokens = triageConfig.thinkingTokens ?? 0;

  const classifyBaseUrl = triageConfig.classifyBaseUrl ?? null;
  const respondBaseUrl = triageConfig.respondBaseUrl ?? null;
  const classifyApiKey = triageConfig.classifyApiKey ?? null;
  const respondApiKey = triageConfig.respondApiKey ?? null;

  return {
    classifyModel,
    respondModel,
    classifyBudget,
    respondBudget,
    timeout,
    thinkingTokens,
    classifyBaseUrl,
    respondBaseUrl,
    classifyApiKey,
    respondApiKey,
  };
}

// ── Channel eligibility ──────────────────────────────────────────────────────

/**
 * Determine whether a channel should be considered for triage.
 * @param {string} channelId - ID of the channel to evaluate.
 * @param {Object} triageConfig - Triage configuration containing include/exclude lists.
 * @param {string[]} [triageConfig.channels] - Whitelisted channel IDs; an empty array means all channels are allowed.
 * @param {string[]} [triageConfig.excludeChannels] - Blacklisted channel IDs; exclusions take precedence over the whitelist.
 * @returns {boolean} `true` if the channel is eligible, `false` otherwise.
 */
export function isChannelEligible(channelId, triageConfig) {
  const { channels = [], excludeChannels = [] } = triageConfig;

  // Explicit exclusion always wins
  if (excludeChannels.includes(channelId)) return false;

  // Empty allow-list means all channels are allowed
  if (channels.length === 0) return true;

  return channels.includes(channelId);
}

// ── Role eligibility ─────────────────────────────────────────────────────────

/**
 * Determine whether a user's roles make them eligible for triage.
 * @param {import('discord.js').GuildMember|null} member - The guild member to evaluate.
 * @param {Object} triageConfig - Triage configuration containing role lists.
 * @param {string[]} [triageConfig.allowedRoles] - Whitelisted role IDs; empty = all allowed.
 * @param {string[]} [triageConfig.excludedRoles] - Blacklisted role IDs; exclusions win.
 * @returns {boolean} `true` if the member is eligible, `false` otherwise.
 */
export function isRoleEligible(member, triageConfig) {
  const { allowedRoles = [], excludedRoles = [] } = triageConfig;

  // No member (DM) — cannot check roles, allow through
  if (!member) return true;

  // Get member's role IDs as Set for O(1) lookups (excluding @everyone which has id === guildId)
  const memberRoleIds = new Set(
    member.roles.cache.filter((role) => role.id !== member.guild.id).map((role) => role.id),
  );

  // Explicit exclusion always wins (OR logic — any match excludes)
  if (excludedRoles.some((roleId) => memberRoleIds.has(roleId))) return false;

  // Empty allow-list means all roles are allowed
  if (allowedRoles.length === 0) return true;

  // Check if user has ANY of the allowed roles (OR logic)
  return allowedRoles.some((roleId) => memberRoleIds.has(roleId));
}

// ── Message type eligibility ─────────────────────────────────────────────────

/**
 * Check if a message type is eligible for triage (default or reply only).
 * Rejects system messages (joins, boosts, pins) and webhook messages.
 * @param {Object} message - Discord message object
 * @returns {boolean} true if message type is eligible
 */
export function isMessageTypeEligible(message) {
  // Skip webhook messages (GitHub, Jira integrations, etc.)
  if (message.webhookId) return false;

  // Skip system messages — only default messages and replies are eligible
  const messageType = message.type ?? 0;
  return messageType === MessageType.Default || messageType === MessageType.Reply;
}

// ── Dynamic interval thresholds ──────────────────────────────────────────────

/**
 * Calculate the evaluation interval based on queue size.
 * More messages in the buffer means faster evaluation cycles.
 * Uses baseInterval as the longest interval.
 * @param {number} queueSize - Number of messages in the channel buffer
 * @param {number} [baseInterval=5000] - Base interval from config.triage.defaultInterval
 * @returns {number} Interval in milliseconds
 */
export function getDynamicInterval(queueSize, baseInterval = 5000) {
  if (queueSize <= 1) return baseInterval;
  if (queueSize <= 4) return Math.round(baseInterval / 2);
  return Math.round(baseInterval / 5);
}
