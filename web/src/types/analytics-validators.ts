import type { AnalyticsRangePreset, DashboardAnalytics } from '@/types/analytics';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Check whether a value is a finite number.
 *
 * @returns `true` if `value` is a finite number, `false` otherwise.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Determines whether a value is `null` or a finite number.
 *
 * @param value - The value to test
 * @returns `true` if the value is `null` or a finite number, `false` otherwise.
 */
function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

/**
 * Determines whether a value is a string.
 *
 * @returns `true` if `value` is a string, `false` otherwise.
 */
function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isAnalyticsRangePreset(value: unknown): value is AnalyticsRangePreset {
  return value === 'today' || value === 'week' || value === 'month' || value === 'custom';
}

// --- Section validators extracted from isDashboardAnalyticsPayload ---

function isValidRange(range: unknown): boolean {
  if (!isRecord(range)) return false;
  if (!isAnalyticsRangePreset(range.type)) return false;
  if (!isString(range.from) || !isString(range.to)) return false;
  if (range.interval !== 'hour' && range.interval !== 'day') return false;
  if (range.channelId !== null && !isString(range.channelId)) return false;
  if (range.compare !== undefined && typeof range.compare !== 'boolean') return false;
  return true;
}

/**
 * Validates that a value matches the expected KPIs structure for dashboard analytics.
 *
 * @param kpis - The value to validate as KPIs
 * @returns `true` if `kpis` is a record containing finite numbers for `totalMessages`, `aiRequests`, `activeUsers`, and `newMembers`, and a finite number or `null` for `aiCostUsd`; `false` otherwise.
 */
function isValidKpis(kpis: unknown): boolean {
  if (!isRecord(kpis)) return false;
  return (
    isFiniteNumber(kpis.totalMessages) &&
    isFiniteNumber(kpis.aiRequests) &&
    isFiniteNumberOrNull(kpis.aiCostUsd) &&
    isFiniteNumber(kpis.activeUsers) &&
    isFiniteNumber(kpis.newMembers)
  );
}

function isValidRealtime(realtime: unknown): boolean {
  if (!isRecord(realtime)) return false;
  if (realtime.onlineMembers !== null && !isFiniteNumber(realtime.onlineMembers)) return false;
  if (!isFiniteNumber(realtime.activeAiConversations)) return false;
  return true;
}

function isValidMessageVolumePoint(point: unknown): boolean {
  return (
    isRecord(point) &&
    isString(point.bucket) &&
    isString(point.label) &&
    isFiniteNumber(point.messages) &&
    isFiniteNumber(point.aiRequests)
  );
}

function isValidMessageVolume(messageVolume: unknown): boolean {
  return Array.isArray(messageVolume) && messageVolume.every(isValidMessageVolumePoint);
}

function isValidAiUsageEntry(entry: unknown): boolean {
  return (
    isRecord(entry) &&
    isString(entry.model) &&
    isFiniteNumber(entry.requests) &&
    isFiniteNumber(entry.promptTokens) &&
    isFiniteNumber(entry.completionTokens) &&
    isFiniteNumber(entry.costUsd)
  );
}

/**
 * Determines whether a value conforms to the expected AI usage payload structure.
 *
 * Validates that the value is an object with `source` equal to `'unavailable'` or `'ai_usage'`,
 * a `tokens` object whose `prompt` and `completion` are either finite numbers or `null`,
 * and a `byModel` array where every entry is a valid AI usage entry.
 *
 * @param aiUsage - The value to validate as an AI usage payload
 * @returns `true` if `aiUsage` matches the expected AI usage structure, `false` otherwise.
 */
function isValidAiUsage(aiUsage: unknown): boolean {
  if (!isRecord(aiUsage)) return false;
  // Backward compat: legacy payloads may lack `source` (treat as valid legacy)
  if (
    aiUsage.source !== undefined &&
    aiUsage.source !== 'unavailable' &&
    aiUsage.source !== 'ai_usage'
  )
    return false;
  if (
    !isRecord(aiUsage.tokens) ||
    !isFiniteNumberOrNull(aiUsage.tokens.prompt) ||
    !isFiniteNumberOrNull(aiUsage.tokens.completion)
  ) {
    return false;
  }
  return Array.isArray(aiUsage.byModel) && aiUsage.byModel.every(isValidAiUsageEntry);
}

function isValidChannelActivityEntry(entry: unknown): boolean {
  return (
    isRecord(entry) &&
    isString(entry.channelId) &&
    isString(entry.name) &&
    isFiniteNumber(entry.messages)
  );
}

function isValidChannelActivityArray(arr: unknown): boolean {
  return Array.isArray(arr) && arr.every(isValidChannelActivityEntry);
}

function isValidCommandUsageEntry(entry: unknown): boolean {
  return isRecord(entry) && isString(entry.command) && isFiniteNumber(entry.uses);
}

function isValidCommandUsage(commandUsage: unknown): boolean {
  if (commandUsage === undefined) return true;
  if (!isRecord(commandUsage)) return false;
  if (!isString(commandUsage.source)) return false;
  return Array.isArray(commandUsage.items) && commandUsage.items.every(isValidCommandUsageEntry);
}

function isValidComparison(comparison: unknown): boolean {
  if (comparison === undefined || comparison === null) return true;
  if (!isRecord(comparison)) return false;
  if (!isRecord(comparison.previousRange) || !isRecord(comparison.kpis)) return false;
  if (!isString(comparison.previousRange.from) || !isString(comparison.previousRange.to)) {
    return false;
  }
  return isValidKpis(comparison.kpis);
}

function isValidHeatmapEntry(entry: unknown): boolean {
  return (
    isRecord(entry) &&
    isFiniteNumber(entry.dayOfWeek) &&
    isFiniteNumber(entry.hour) &&
    isFiniteNumber(entry.messages)
  );
}

function isValidHeatmap(heatmap: unknown): boolean {
  return Array.isArray(heatmap) && heatmap.every(isValidHeatmapEntry);
}

function isValidUserEngagement(ue: unknown): boolean {
  if (ue === undefined || ue === null) return true;
  return (
    isRecord(ue) &&
    isFiniteNumber(ue.trackedUsers) &&
    isFiniteNumber(ue.totalMessagesSent) &&
    isFiniteNumber(ue.totalReactionsGiven) &&
    isFiniteNumber(ue.totalReactionsReceived) &&
    isFiniteNumber(ue.avgMessagesPerUser)
  );
}

function isValidXpEconomy(xp: unknown): boolean {
  if (xp === undefined || xp === null) return true;
  return (
    isRecord(xp) &&
    isFiniteNumber(xp.totalUsers) &&
    isFiniteNumber(xp.totalXp) &&
    isFiniteNumber(xp.avgLevel) &&
    isFiniteNumber(xp.maxLevel)
  );
}

export function isDashboardAnalyticsPayload(value: unknown): value is DashboardAnalytics {
  if (!isRecord(value)) return false;
  if (!isString(value.guildId)) return false;
  if (!isValidRange(value.range)) return false;
  if (!isValidKpis(value.kpis)) return false;
  if (!isValidRealtime(value.realtime)) return false;
  if (!isValidMessageVolume(value.messageVolume)) return false;
  if (!isValidAiUsage(value.aiUsage)) return false;
  if (!isValidChannelActivityArray(value.channelActivity)) return false;

  if (value.topChannels !== undefined && !isValidChannelActivityArray(value.topChannels)) {
    return false;
  }

  if (!isValidCommandUsage(value.commandUsage)) return false;
  if (!isValidComparison(value.comparison)) return false;
  if (!isValidHeatmap(value.heatmap)) return false;
  if (!isValidUserEngagement(value.userEngagement)) return false;
  if (!isValidXpEconomy(value.xpEconomy)) return false;

  return true;
}
