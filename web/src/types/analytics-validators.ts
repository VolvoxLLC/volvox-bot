import type {
  AnalyticsRangePreset,
  DashboardAnalytics,
} from "@/types/analytics";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isAnalyticsRangePreset(value: unknown): value is AnalyticsRangePreset {
  return value === "today" || value === "week" || value === "month" || value === "custom";
}

export function isDashboardAnalyticsPayload(value: unknown): value is DashboardAnalytics {
  if (!isRecord(value)) return false;

  const range = value.range;
  const kpis = value.kpis;
  const realtime = value.realtime;
  const aiUsage = value.aiUsage;

  if (!isString(value.guildId)) return false;
  if (!isRecord(range)) return false;
  if (!isRecord(kpis)) return false;
  if (!isRecord(realtime)) return false;
  if (!isRecord(aiUsage)) return false;

  if (!isAnalyticsRangePreset(range.type)) return false;
  if (!isString(range.from) || !isString(range.to)) return false;
  if (range.interval !== "hour" && range.interval !== "day") return false;
  if (range.channelId !== null && !isString(range.channelId)) return false;

  if (
    !isFiniteNumber(kpis.totalMessages) ||
    !isFiniteNumber(kpis.aiRequests) ||
    !isFiniteNumber(kpis.aiCostUsd) ||
    !isFiniteNumber(kpis.activeUsers) ||
    !isFiniteNumber(kpis.newMembers)
  ) {
    return false;
  }

  if (
    (realtime.onlineMembers !== null && !isFiniteNumber(realtime.onlineMembers)) ||
    !isFiniteNumber(realtime.activeAiConversations)
  ) {
    return false;
  }

  if (
    !Array.isArray(value.messageVolume) ||
    !value.messageVolume.every(
      (point) =>
        isRecord(point) &&
        isString(point.bucket) &&
        isString(point.label) &&
        isFiniteNumber(point.messages) &&
        isFiniteNumber(point.aiRequests),
    )
  ) {
    return false;
  }

  if (
    !isRecord(aiUsage.tokens) ||
    !isFiniteNumber(aiUsage.tokens.prompt) ||
    !isFiniteNumber(aiUsage.tokens.completion)
  ) {
    return false;
  }

  if (
    !Array.isArray(aiUsage.byModel) ||
    !aiUsage.byModel.every(
      (entry) =>
        isRecord(entry) &&
        isString(entry.model) &&
        isFiniteNumber(entry.requests) &&
        isFiniteNumber(entry.promptTokens) &&
        isFiniteNumber(entry.completionTokens) &&
        isFiniteNumber(entry.costUsd),
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(value.channelActivity) ||
    !value.channelActivity.every(
      (entry) =>
        isRecord(entry) &&
        isString(entry.channelId) &&
        isString(entry.name) &&
        isFiniteNumber(entry.messages),
    )
  ) {
    return false;
  }

  if (
    !Array.isArray(value.heatmap) ||
    !value.heatmap.every(
      (entry) =>
        isRecord(entry) &&
        isFiniteNumber(entry.dayOfWeek) &&
        isFiniteNumber(entry.hour) &&
        isFiniteNumber(entry.messages),
    )
  ) {
    return false;
  }

  return true;
}
