/** Thread mode settings for AI chat. */
export interface AiThreadMode {
  enabled: boolean;
  autoArchiveMinutes: number;
  reuseWindowMinutes: number;
}

/** Per-channel AI response mode. */
export type ChannelMode = 'off' | 'mention' | 'vibe';

/** AI chat configuration. */
export interface AiConfig {
  enabled: boolean;
  systemPrompt: string;
  channels: string[];
  blockedChannelIds: string[];
  historyLength: number;
  historyTTLDays: number;
  threadMode: AiThreadMode;
  channelModes: Record<string, ChannelMode>;
  defaultChannelMode: ChannelMode;
}

/** AI Auto-Moderation configuration. */
export interface AiAutoModConfig {
  enabled: boolean;
  model: string;
  thresholds: {
    toxicity: number;
    spam: number;
    harassment: number;
  };
  actions: {
    toxicity: string;
    spam: string;
    harassment: string;
  };
  timeoutDurationMs: number;
  flagChannelId: string | null;
  autoDelete: boolean;
  exemptRoleIds: string[];
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

/** Self-assignable role menu option. */
export interface WelcomeRoleOption {
  id?: string;
  label: string;
  roleId: string;
  description?: string;
}

/** Self-assignable role menu settings. */
export interface WelcomeRoleMenu {
  enabled: boolean;
  message?: string;
  options: WelcomeRoleOption[];
}

/** Direct-message onboarding sequence. */
export interface WelcomeDmSequence {
  enabled: boolean;
  steps: string[];
}

/** Welcome message configuration. */
export interface WelcomeConfig {
  enabled: boolean;
  channelId: string;
  message: string;
  returningMessage?: string | null;
  returningMessageEnabled?: boolean;
  rulesMessage?: string;
  introMessage?: string;
  dynamic: WelcomeDynamic;
  rulesChannel: string | null;
  roleMenuChannel: string | null;
  verifiedRole: string | null;
  introChannel: string | null;
  roleMenu: WelcomeRoleMenu;
  dmSequence: WelcomeDmSequence;
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

/** Protected role configuration. */
export interface ModerationProtectRoles {
  enabled: boolean;
  roleIds: string[];
  includeAdmins: boolean;
  includeModerators: boolean;
  includeServerOwner: boolean;
}

/** Warning system severity point overrides. */
export interface WarningSeverityPoints {
  low: number;
  medium: number;
  high: number;
}

/** Warning system configuration. */
export interface WarningsConfig {
  expiryDays: number | null;
  severityPoints: WarningSeverityPoints;
  maxPerPage: number;
}

/** Moderation configuration. */
export interface ModerationConfig {
  enabled: boolean;
  alertChannelId?: string | null;
  autoDelete: boolean;
  dmNotifications: ModerationDmNotifications;
  escalation: ModerationEscalation;
  logging: ModerationLogging;
  protectRoles?: ModerationProtectRoles;
  rateLimit?: RateLimitConfig;
  linkFilter?: LinkFilterConfig;
  warnings?: WarningsConfig;
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
  adminRoleIds: string[];
  moderatorRoleIds: string[];
  /** @deprecated Use adminRoleIds. Kept for backward compat with legacy guild configs. */
  adminRoleId?: string | null;
  /** @deprecated Use moderatorRoleIds. Kept for backward compat with legacy guild configs. */
  moderatorRoleId?: string | null;
  modRoles: string[];
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
  contextMessages: number;
  timeout: number;
  moderationResponse: boolean;
  channels: string[];
  excludeChannels: string[];
  allowedRoles?: string[];
  excludedRoles?: string[];
  includeBotsInContext?: boolean;
  botAllowlist?: string[];
  debugFooter: boolean;
  debugFooterLevel?: string | null;
  moderationLogChannel: string | null;
  statusReactions?: boolean | null;
  dailyBudgetUsd?: number | null;
  confidenceThreshold?: number | null;
  responseCooldownMs?: number | null;
}

/** Generic enabled-flag section used by several community features. */
export interface ToggleSectionConfig {
  enabled: boolean;
}

export interface BotStatusRotationMessage {
  type?: 'Playing' | 'Watching' | 'Listening' | 'Competing' | 'Custom';
  text: string;
}

export interface BotStatusRotationConfig {
  enabled?: boolean;
  intervalMinutes?: number;
  messages?: BotStatusRotationMessage[];
}

export interface BotStatusConfig {
  enabled?: boolean;
  status?: 'online' | 'idle' | 'dnd' | 'invisible';
  rotation?: BotStatusRotationConfig;
  // Legacy fields for backward compatibility
  activityType?: string;
  activities?: string[];
  rotateIntervalMs?: number;
}

/** TL;DR summary feature settings. */
export interface TldrConfig extends ToggleSectionConfig {
  systemPrompt?: string;
  defaultMessages: number;
  maxMessages: number;
  cooldownSeconds: number;
}

/** Reputation/XP settings. */
export interface ReputationConfig extends ToggleSectionConfig {
  xpPerMessage: number[];
  xpCooldownSeconds: number;
  levelThresholds: number[];
  announceChannelId: string | null;
}

/** XP level-up action definition. */
export interface XpActionEmbedField {
  id?: string;
  name: string | null;
  value: string | null;
  inline: boolean | null;
}

export type XpActionEmbedThumbnailType = 'none' | 'user_avatar' | 'server_icon' | 'custom';

export interface XpActionEmbedConfig {
  // The dashboard writes thumbnailType/thumbnailUrl, footerText/footerIconUrl, imageUrl, and
  // showTimestamp. Runtime normalization still accepts legacy thumbnail/footer/image/timestamp aliases.
  color?: string | null;
  title?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  thumbnailType?: XpActionEmbedThumbnailType | null;
  thumbnailUrl?: string | null;
  fields?: XpActionEmbedField[] | null;
  footer?: string | { text?: string | null; iconURL?: string | null } | null;
  footerText?: string | null;
  footerIconUrl?: string | null;
  image?: string | null;
  imageUrl?: string | null;
  timestamp?: boolean | null;
  showTimestamp?: boolean | null;
}

export interface XpLevelAction {
  id?: string;
  type:
    | 'grantRole'
    | 'removeRole'
    | 'sendDm'
    | 'announce'
    | 'xpBonus'
    | 'addReaction'
    | 'nickPrefix'
    | 'nickSuffix'
    | 'webhook';
  roleId?: string;
  message?: string;
  template?: string;
  format?: 'text' | 'embed' | 'both';
  channelMode?: 'current' | 'specific' | 'none';
  channelId?: string;
  emoji?: string;
  amount?: number;
  prefix?: string;
  suffix?: string;
  url?: string;
  payload?: string;
  embed?: XpActionEmbedConfig;
}

/** Per-level action configuration. */
export interface XpLevelActionEntry {
  id?: string;
  level: number;
  actions: XpLevelAction[];
}

export interface XpLevelUpDmMessage {
  level: number;
  message: string;
}

export interface XpLevelUpDmConfig {
  enabled: boolean;
  sendOnEveryLevel: boolean;
  defaultMessage: string;
  messages: XpLevelUpDmMessage[];
}

/** XP / Level-Up Actions configuration. */
export interface XpConfig extends ToggleSectionConfig {
  levelThresholds: number[];
  levelActions: XpLevelActionEntry[];
  defaultActions: XpLevelAction[];
  levelUpDm: XpLevelUpDmConfig;
  roleRewards: {
    stackRoles: boolean;
    removeOnLevelDown: boolean;
  };
}

/** Activity badge definition for profile/engagement. */
export interface ActivityBadge {
  days: number;
  label: string;
}

/** Engagement tracking settings. */
export interface EngagementConfig extends ToggleSectionConfig {
  trackMessages: boolean;
  trackReactions: boolean;
  activityBadges: ActivityBadge[];
}

/** Github feed settings. */
export interface GithubFeedConfig extends ToggleSectionConfig {
  channelId: string | null;
  repos: string[];
  events: string[];
  pollIntervalMinutes?: number;
}

/** Github integration settings. */
export interface GithubConfig {
  feed: GithubFeedConfig;
}

/** Review request system settings. */
export interface ReviewConfig extends ToggleSectionConfig {
  channelId: string | null;
  staleAfterDays: number;
  xpReward: number;
}

/** Ticket system settings. */
export interface TicketsConfig extends ToggleSectionConfig {
  mode: 'thread' | 'channel';
  supportRole: string | null;
  category: string | null;
  autoCloseHours: number;
  transcriptChannel: string | null;
  maxOpenPerUser: number;
}

/** Daily challenge scheduler settings. */
export interface ChallengesConfig extends ToggleSectionConfig {
  channelId: string | null;
  postTime: string;
  timezone: string;
}

/** Full bot config response from GET /api/guilds/:id/config. */
/** Audit log configuration. */
export interface AuditLogConfig {
  /** Whether automatic audit logging is enabled for this guild. */
  enabled: boolean;
  /** How many days to retain audit log entries (0 = keep forever). */
  retentionDays: number;
}

export interface BotConfig {
  guildId: string;
  ai: AiConfig;
  aiAutoMod?: AiAutoModConfig;
  welcome: WelcomeConfig;
  spam: SpamConfig;
  moderation: ModerationConfig;
  triage?: TriageConfig;
  starboard?: StarboardConfig;
  permissions?: PermissionsConfig;
  memory?: MemoryConfig;

  // Community/dashboard sections
  help?: ToggleSectionConfig;
  announce?: ToggleSectionConfig;
  snippet?: ToggleSectionConfig;
  poll?: ToggleSectionConfig;
  showcase?: ToggleSectionConfig;
  tldr?: TldrConfig;
  reputation?: ReputationConfig;
  xp?: XpConfig;
  afk?: ToggleSectionConfig;
  engagement?: EngagementConfig;
  github?: GithubConfig;
  review?: ReviewConfig;
  challenges?: ChallengesConfig;
  tickets?: TicketsConfig;
  auditLog?: AuditLogConfig;
  botStatus?: BotStatusConfig;
}

/** All config sections shown in the editor. */
export type ConfigSection =
  | 'ai'
  | 'welcome'
  | 'spam'
  | 'moderation'
  | 'triage'
  | 'starboard'
  | 'permissions'
  | 'memory'
  | 'help'
  | 'announce'
  | 'snippet'
  | 'poll'
  | 'showcase'
  | 'tldr'
  | 'reputation'
  | 'xp'
  | 'afk'
  | 'engagement'
  | 'github'
  | 'review'
  | 'challenges'
  | 'tickets'
  | 'auditLog'
  | 'botStatus';

/**
 * @deprecated Use {@link ConfigSection} directly.
 * Sections that can be modified via the PATCH endpoint.
 */
export type WritableConfigSection = ConfigSection;

/** Maximum characters allowed for the AI system prompt in the config editor. */
export const SYSTEM_PROMPT_MAX_LENGTH = 4000;

/** Recursively make all properties optional (including optional/union object fields). */
type DeepPartialValue<T> = T extends (infer U)[]
  ? DeepPartialValue<U>[]
  : T extends object
    ? DeepPartial<T>
    : T;

export type DeepPartial<T> = {
  [P in keyof T]?: DeepPartialValue<T[P]>;
};
