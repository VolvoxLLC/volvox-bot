/**
 * Triage Configuration
 * Config resolution with 3-layer legacy fallback and channel eligibility checks.
 */

// ── Config resolution ───────────────────────────────────────────────────────

/**
 * Resolve triage config with 3-layer legacy fallback:
 * 1. New split format: classifyModel / respondModel / classifyBudget / respondBudget
 * 2. PR #68 flat format: model / budget / timeout
 * 3. Original nested format: models.default / budget.response / timeouts.response
 * @param {Object} triageConfig - Raw triage configuration object
 * @returns {Object} Resolved configuration with canonical field names
 */
export function resolveTriageConfig(triageConfig) {
  const classifyModel = triageConfig.classifyModel ?? 'claude-haiku-4-5';

  const respondModel =
    triageConfig.respondModel ??
    (typeof triageConfig.model === 'string'
      ? triageConfig.model
      : (triageConfig.models?.default ?? 'claude-sonnet-4-6'));

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

  const tokenRecycleLimit = triageConfig.tokenRecycleLimit ?? 20000;
  const thinkingTokens = triageConfig.thinkingTokens ?? 4096;
  const streaming = triageConfig.streaming ?? false;

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
    tokenRecycleLimit,
    thinkingTokens,
    streaming,
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
