/** Thread mode settings for AI chat. */
export interface AiThreadMode {
  enabled: boolean;
  autoArchiveMinutes: number;
  reuseWindowMinutes: number;
}

/** AI chat configuration. */
export interface AiConfig {
  enabled: boolean;
  systemPrompt: string;
  channels: string[];
  historyLength: number;
  historyTTLDays: number;
  threadMode: AiThreadMode;
}

/** Dynamic welcome message generation settings. */
export interface WelcomeDynamic {
  enabled: boolean;
  timezone: string;
  activityWindowMinutes: number;
  milestoneInterval: number;
  highlightChannels: string[];
  excludeChannels: string[];
}

/** Welcome message configuration. */
export interface WelcomeConfig {
  enabled: boolean;
  channelId: string;
  message: string;
  dynamic: WelcomeDynamic;
}

/** Spam config is a passthrough — shape defined by the bot's spam module. */
export interface SpamConfig {
  [key: string]: unknown;
}

/** DM notification settings per moderation action. */
export interface ModerationDmNotifications {
  warn: boolean;
  timeout: boolean;
  kick: boolean;
  ban: boolean;
}

/** Escalation threshold definition. */
export interface EscalationThreshold {
  warns: number;
  withinDays: number;
  action: string;
  duration?: string;
}

/** Escalation configuration. */
export interface ModerationEscalation {
  enabled: boolean;
  thresholds: EscalationThreshold[];
}

/** Per-action log channels. */
export interface ModerationLogChannels {
  default: string | null;
  warns: string | null;
  bans: string | null;
  kicks: string | null;
  timeouts: string | null;
  purges: string | null;
  locks: string | null;
}

/** Moderation logging configuration. */
export interface ModerationLogging {
  channels: ModerationLogChannels;
}

/** Rate limiting configuration nested under moderation. */
export interface RateLimitConfig {
  enabled: boolean;
  maxMessages: number;
  windowSeconds: number;
  muteAfterTriggers: number;
  muteWindowSeconds: number;
  muteDurationSeconds: number;
}

/** Link filtering configuration nested under moderation. */
export interface LinkFilterConfig {
  enabled: boolean;
  blockedDomains: string[];
}

/** Moderation configuration. */
export interface ModerationConfig {
  enabled: boolean;
  alertChannelId: string;
  autoDelete: boolean;
  dmNotifications: ModerationDmNotifications;
  escalation: ModerationEscalation;
  logging: ModerationLogging;
  rateLimit?: RateLimitConfig;
  linkFilter?: LinkFilterConfig;
}

/** Starboard configuration. */
export interface StarboardConfig {
  enabled: boolean;
  channelId: string;
  threshold: number;
  emoji: string;
  selfStarAllowed: boolean;
  ignoredChannels: string[];
}

/** Permissions configuration. */
export interface PermissionsConfig {
  enabled: boolean;
  adminRoleId: string | null;
  moderatorRoleId: string | null;
  botOwners: string[];
  usePermissions: boolean;
  allowedCommands: Record<string, string>;
}

/** Memory configuration. */
export interface MemoryConfig {
  enabled: boolean;
  maxContextMemories: number;
  autoExtract: boolean;
}

/** Triage configuration. */
export interface TriageConfig {
  enabled: boolean;
  defaultInterval: number;
  maxBufferSize: number;
  triggerWords: string[];
  moderationKeywords: string[];
  classifyModel: string;
  classifyBudget: number;
  respondModel: string;
  respondBudget: number;
  thinkingTokens: number;
  classifyBaseUrl: string | null;
  classifyApiKey: string | null;
  respondBaseUrl: string | null;
  respondApiKey: string | null;
  streaming: boolean;
  tokenRecycleLimit: number;
  contextMessages: number;
  timeout: number;
  moderationResponse: boolean;
  channels: string[];
  excludeChannels: string[];
  debugFooter: boolean;
  debugFooterLevel: string;
  moderationLogChannel: string;
  statusReactions: boolean;
}

/** Full bot config response from GET /api/guilds/:id/config. */
export interface BotConfig {
  guildId: string;
  ai: AiConfig;
  welcome: WelcomeConfig;
  spam: SpamConfig;
  moderation: ModerationConfig;
  triage?: TriageConfig;
  starboard?: StarboardConfig;
  permissions?: PermissionsConfig;
  memory?: MemoryConfig;
}

/** All config sections shown in the editor. */
export type ConfigSection = "ai" | "welcome" | "spam" | "moderation" | "triage" | "starboard" | "permissions" | "memory";

/**
 * @deprecated Use {@link ConfigSection} directly.
 * Sections that can be modified via the PATCH endpoint.
 */
export type WritableConfigSection = ConfigSection;

/** Maximum characters allowed for the AI system prompt in the config editor. */
export const SYSTEM_PROMPT_MAX_LENGTH = 4000;

/** Recursively make all properties optional. */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};
