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
  dynamic: WelcomeDynamic;
  rulesChannel: string | null;
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

/** Moderation configuration. */
export interface ModerationConfig {
  enabled: boolean;
  alertChannelId: string;
  autoDelete: boolean;
  dmNotifications: ModerationDmNotifications;
  escalation: ModerationEscalation;
  logging: ModerationLogging;
  protectRoles?: ModerationProtectRoles;
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
  modRoles: string[];
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

/** Generic enabled-flag section used by several community features. */
export interface ToggleSectionConfig {
  enabled: boolean;
}

/** TL;DR summary feature settings. */
export interface TldrConfig extends ToggleSectionConfig {
  defaultMessages: number;
  maxMessages: number;
  cooldownSeconds: number;
}

/** Reputation/XP settings. */
export interface ReputationConfig extends ToggleSectionConfig {
  xpPerMessage: number[];
  xpCooldownSeconds: number;
  announceChannelId: string | null;
  levelThresholds: number[];
  roleRewards: Record<string, string>;
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

/** GitHub feed settings. */
export interface GithubFeedConfig extends ToggleSectionConfig {
  channelId: string | null;
  repos: string[];
  events: string[];
  pollIntervalMinutes?: number;
}

/** GitHub integration settings. */
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

  // Community/dashboard sections
  help?: ToggleSectionConfig;
  announce?: ToggleSectionConfig;
  snippet?: ToggleSectionConfig;
  poll?: ToggleSectionConfig;
  showcase?: ToggleSectionConfig;
  tldr?: TldrConfig;
  reputation?: ReputationConfig;
  afk?: ToggleSectionConfig;
  engagement?: EngagementConfig;
  github?: GithubConfig;
  review?: ReviewConfig;
  challenges?: ChallengesConfig;
  tickets?: TicketsConfig;
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
  | 'afk'
  | 'engagement'
  | 'github'
  | 'review'
  | 'challenges'
  | 'tickets';

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
