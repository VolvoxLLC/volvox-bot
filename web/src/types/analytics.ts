export type AnalyticsRangePreset = 'today' | 'week' | 'month' | 'custom';
export type AnalyticsInterval = 'hour' | 'day';

export interface AnalyticsRange {
  type: AnalyticsRangePreset;
  from: string;
  to: string;
  interval: AnalyticsInterval;
  channelId: string | null;
  compare?: boolean;
}

export interface DashboardKpis {
  totalMessages: number;
  aiRequests: number;
  aiCostUsd: number;
  activeUsers: number;
  newMembers: number;
}

export interface DashboardRealtime {
  onlineMembers: number | null;
  activeAiConversations: number;
}

export interface MessageVolumePoint {
  bucket: string;
  label: string;
  messages: number;
  aiRequests: number;
}

export interface ModelUsage {
  model: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export interface ChannelBreakdownEntry {
  channelId: string;
  name: string;
  messages: number;
}

export interface CommandUsageEntry {
  command: string;
  uses: number;
}

export interface UserEngagementMetrics {
  trackedUsers: number;
  totalMessagesSent: number;
  totalReactionsGiven: number;
  totalReactionsReceived: number;
  avgMessagesPerUser: number;
}

export interface XpEconomy {
  totalUsers: number;
  totalXp: number;
  avgLevel: number;
  maxLevel: number;
}

export interface DashboardAnalytics {
  guildId: string;
  range: AnalyticsRange;
  kpis: DashboardKpis;
  realtime: DashboardRealtime;
  messageVolume: MessageVolumePoint[];
  aiUsage: {
    byModel: ModelUsage[];
    tokens: {
      prompt: number;
      completion: number;
    };
  };
  channelActivity: ChannelBreakdownEntry[];
  topChannels?: ChannelBreakdownEntry[];
  commandUsage?: {
    source: 'logs' | 'unavailable';
    items: CommandUsageEntry[];
  };
  comparison?: {
    previousRange: {
      from: string;
      to: string;
    };
    kpis: DashboardKpis;
  } | null;
  heatmap: Array<{
    dayOfWeek: number;
    hour: number;
    messages: number;
  }>;
  userEngagement: UserEngagementMetrics | null;
  xpEconomy: XpEconomy | null;
}
