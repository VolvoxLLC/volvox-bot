import { logger } from '@/lib/logger';
import type {
  ConfigCategoryId,
  ConfigCategoryMeta,
  ConfigFeatureId,
  ConfigSearchItem,
} from './types';

export const CONFIG_CATEGORIES: ConfigCategoryMeta[] = [
  {
    id: 'ai-automation',
    icon: 'sparkles',
    label: 'AI & Automation',
    description: 'AI chat, triage, and memory behavior.',
    sectionKeys: ['ai', 'triage', 'memory'],
    featureIds: ['ai-chat', 'triage', 'memory'],
  },
  {
    id: 'onboarding-growth',
    icon: 'users',
    label: 'Onboarding & Growth',
    description: 'Welcome flow, XP systems, challenges, and lightweight automation.',
    sectionKeys: ['welcome', 'reputation', 'xp', 'engagement', 'tldr', 'afk', 'challenges'],
    featureIds: [
      'welcome',
      'reputation',
      'xp-level-actions',
      'engagement',
      'tldr-afk',
      'challenges',
    ],
  },
  {
    id: 'moderation-safety',
    icon: 'message-square-warning',
    label: 'Moderation & Safety',
    description: 'Content safety, moderation actions, role permissions, and audit logging.',
    sectionKeys: ['aiAutoMod', 'moderation', 'permissions', 'auditLog'],
    featureIds: ['ai-automod', 'moderation', 'permissions', 'audit-log'],
  },
  {
    id: 'community-tools',
    icon: 'bot',
    label: 'Community Tools',
    description: 'Member-facing utility commands, starboard, and bot presence.',
    sectionKeys: [
      'help',
      'announce',
      'snippet',
      'poll',
      'showcase',
      'review',
      'starboard',
      'botStatus',
    ],
    featureIds: ['community-tools', 'starboard', 'bot-status'],
  },
  {
    id: 'support-integrations',
    icon: 'ticket',
    label: 'Support & Integrations',
    description: 'Tickets and Github activity automation.',
    sectionKeys: ['tickets', 'github'],
    featureIds: ['tickets', 'github-feed'],
  },
];

export const DEFAULT_CONFIG_CATEGORY: ConfigCategoryId = 'ai-automation';

export const FEATURE_LABELS: Record<ConfigFeatureId, string> = {
  'ai-chat': 'AI Chat',
  'ai-automod': 'Content Safety',
  triage: 'Triage',
  memory: 'Memory',
  welcome: 'Welcome Messages',
  reputation: 'Reputation / XP',
  'xp-level-actions': 'Level-Up Actions',
  engagement: 'Activity Badges',
  'tldr-afk': 'TL;DR & AFK',
  challenges: 'Daily Coding Challenges',
  moderation: 'Moderation',
  starboard: 'Starboard',
  permissions: 'Permissions',
  'community-tools': 'Community Command Toggles',
  tickets: 'Tickets',
  'github-feed': 'Github Activity Feed',
  'audit-log': 'Audit Log',
  'bot-status': 'Bot Presence',
};

export const CONFIG_SEARCH_ITEMS: ConfigSearchItem[] = [
  {
    id: 'ai-chat-enabled',
    featureId: 'ai-chat',
    categoryId: 'ai-automation',
    label: 'Enable AI Chat',
    description: 'Turn bot chat responses on or off per guild.',
    keywords: ['ai', 'assistant', 'chat', 'enabled', 'toggle'],
    isAdvanced: false,
  },
  {
    id: 'ai-system-prompt',
    featureId: 'ai-chat',
    categoryId: 'ai-automation',
    label: 'System Prompt',
    description: 'Define assistant behavior and response style.',
    keywords: ['system', 'prompt', 'instructions', 'persona'],
    isAdvanced: false,
  },
  {
    id: 'ai-blocked-channels',
    featureId: 'ai-chat',
    categoryId: 'ai-automation',
    label: 'Blocked Channels',
    description: 'Stop AI replies in selected channels.',
    keywords: ['blocked', 'channels', 'thread', 'mute', 'ignore'],
    isAdvanced: true,
  },
  {
    id: 'ai-automod-enabled',
    featureId: 'ai-automod',
    categoryId: 'moderation-safety',
    label: 'Enable Content Safety',
    description: 'Enable AI-driven moderation actions.',
    keywords: [
      'ai automod',
      'ai-automod',
      'ai auto-moderation',
      'ai auto moderation',
      'ai-moderation',
      'auto moderation',
      'auto-moderation',
      'auto mod',
      'auto-mod',
      'automod',
      'content safety',
      'toxicity',
      'spam',
      'harassment',
      'hate speech',
      'violence',
    ],
    isAdvanced: false,
  },
  {
    id: 'ai-automod-model',
    featureId: 'ai-automod',
    categoryId: 'moderation-safety',
    label: 'Content Safety Model',
    description: 'Choose the model used to score incoming messages.',
    keywords: ['model', 'provider', 'minimax', 'moonshot', 'openrouter'],
    isAdvanced: false,
  },
  {
    id: 'ai-automod-thresholds',
    featureId: 'ai-automod',
    categoryId: 'moderation-safety',
    label: 'Content Safety Thresholds',
    description: 'Tune confidence thresholds and actions.',
    keywords: ['threshold', 'confidence', 'actions', 'warn', 'timeout', 'ban'],
    isAdvanced: true,
  },
  {
    id: 'triage-models',
    featureId: 'triage',
    categoryId: 'ai-automation',
    label: 'Triage Models',
    description: 'Classifier and responder model selection.',
    keywords: ['triage', 'model', 'classify', 'respond'],
    isAdvanced: false,
  },
  {
    id: 'triage-debug',
    featureId: 'triage',
    categoryId: 'ai-automation',
    label: 'Triage Debug Controls',
    description: 'Debug footer, status reactions.',
    keywords: ['debug', 'status reactions', 'footer'],
    isAdvanced: true,
  },
  {
    id: 'memory-enabled',
    featureId: 'memory',
    categoryId: 'ai-automation',
    label: 'Enable Memory',
    description: 'Enable memory extraction and retrieval.',
    keywords: ['memory', 'context', 'enabled'],
    isAdvanced: false,
  },
  {
    id: 'memory-auto-extract',
    featureId: 'memory',
    categoryId: 'ai-automation',
    label: 'Memory Auto-Extract',
    description: 'Automatically store memory facts from chats.',
    keywords: ['auto extract', 'extract', 'memory'],
    isAdvanced: true,
  },
  {
    id: 'welcome-message',
    featureId: 'welcome',
    categoryId: 'onboarding-growth',
    label: 'Welcome Message',
    description: 'Configure join message copy and channels.',
    keywords: ['welcome', 'join', 'rules channel', 'verified role'],
    isAdvanced: false,
  },
  {
    id: 'welcome-role-menu',
    featureId: 'welcome',
    categoryId: 'onboarding-growth',
    label: 'Welcome Role Menu',
    description: 'Configure self-assignable role options.',
    keywords: ['role menu', 'self assign', 'onboarding roles'],
    isAdvanced: true,
  },
  {
    id: 'welcome-dm-sequence',
    featureId: 'welcome',
    categoryId: 'onboarding-growth',
    label: 'Welcome DM Sequence',
    description: 'Configure onboarding DMs sent after join.',
    keywords: ['dm sequence', 'onboarding dm', 'steps'],
    isAdvanced: true,
  },
  {
    id: 'reputation-xp',
    featureId: 'reputation',
    categoryId: 'onboarding-growth',
    label: 'Reputation XP Range',
    description: 'Tune XP gain per message and cooldown between awards.',
    keywords: ['reputation', 'xp', 'cooldown'],
    isAdvanced: false,
  },
  {
    id: 'xp-level-actions-enabled',
    featureId: 'xp-level-actions',
    categoryId: 'onboarding-growth',
    label: 'Enable Level-Up Actions',
    description: 'Configure actions that fire when users reach specific levels.',
    keywords: ['xp', 'level', 'actions', 'role', 'reward', 'level-up'],
    isAdvanced: false,
  },
  {
    id: 'xp-level-thresholds',
    featureId: 'xp-level-actions',
    categoryId: 'onboarding-growth',
    label: 'Level Thresholds',
    description: 'Customize XP requirements per level.',
    keywords: ['thresholds', 'level', 'xp values'],
    isAdvanced: true,
  },
  {
    id: 'xp-level-dm',
    featureId: 'xp-level-actions',
    categoryId: 'onboarding-growth',
    label: 'Level-Up DMs',
    description: 'Configure milestone DMs, per-level overrides, and template previews.',
    keywords: ['levelup', 'level-up', 'dm', 'notification', 'message', 'template', 'milestone'],
    isAdvanced: true,
  },
  {
    id: 'xp-role-stacking',
    featureId: 'xp-level-actions',
    categoryId: 'onboarding-growth',
    label: 'Role Stacking',
    description: 'Control whether users keep all earned roles or only the highest.',
    keywords: ['stack', 'roles', 'replace', 'highest', 'level-down'],
    isAdvanced: true,
  },
  {
    id: 'activity-badges',
    featureId: 'engagement',
    categoryId: 'onboarding-growth',
    label: 'Activity Badges',
    description: 'Configure profile activity badge tiers.',
    keywords: ['activity badges', 'engagement', 'profile'],
    isAdvanced: false,
  },
  {
    id: 'tldr-afk',
    featureId: 'tldr-afk',
    categoryId: 'onboarding-growth',
    label: 'TL;DR and AFK Toggles',
    description: 'Enable summary and away command features.',
    keywords: ['tldr', 'afk', 'summary', 'away'],
    isAdvanced: false,
  },
  {
    id: 'challenges-schedule',
    featureId: 'challenges',
    categoryId: 'onboarding-growth',
    label: 'Challenges Schedule',
    description: 'Configure challenge post channel and timezone.',
    keywords: ['challenges', 'schedule', 'timezone', 'post time'],
    isAdvanced: false,
  },
  {
    id: 'moderation-core',
    featureId: 'moderation',
    categoryId: 'moderation-safety',
    label: 'Moderation Core Settings',
    description: 'Alert channel, auto-delete, and DM notifications.',
    keywords: ['moderation', 'alert channel', 'dm notifications', 'auto delete'],
    isAdvanced: false,
  },
  {
    id: 'moderation-rate-limit',
    featureId: 'moderation',
    categoryId: 'moderation-safety',
    label: 'Moderation Rate Limiting',
    description: 'Configure spam throttling and mute thresholds.',
    keywords: ['rate limit', 'mute duration', 'window', 'spam'],
    isAdvanced: true,
  },
  {
    id: 'moderation-link-filter',
    featureId: 'moderation',
    categoryId: 'moderation-safety',
    label: 'Link Filtering',
    description: 'Block domains and enforce link policy.',
    keywords: ['links', 'domains', 'block list', 'filter'],
    isAdvanced: true,
  },
  {
    id: 'moderation-protect-roles',
    featureId: 'moderation',
    categoryId: 'moderation-safety',
    label: 'Protected Roles',
    description: 'Prevent moderation actions on privileged roles.',
    keywords: ['protect roles', 'admins', 'moderators', 'owner'],
    isAdvanced: true,
  },
  {
    id: 'starboard-core',
    featureId: 'starboard',
    categoryId: 'community-tools',
    label: 'Starboard Core Settings',
    description: 'Set channel and threshold for starboard posts.',
    keywords: ['starboard', 'threshold', 'channel'],
    isAdvanced: false,
  },
  {
    id: 'starboard-advanced',
    featureId: 'starboard',
    categoryId: 'community-tools',
    label: 'Starboard Advanced Settings',
    description: 'Emoji mode, self-star behavior, ignored channels.',
    keywords: ['emoji', 'self star', 'ignored channels'],
    isAdvanced: true,
  },
  {
    id: 'permissions-roles',
    featureId: 'permissions',
    categoryId: 'moderation-safety',
    label: 'Permissions Roles',
    description: 'Admin/mod role IDs and overrides.',
    keywords: ['permissions', 'admin role', 'moderator role'],
    isAdvanced: false,
  },
  {
    id: 'permissions-owners',
    featureId: 'permissions',
    categoryId: 'moderation-safety',
    label: 'Bot Owners',
    description: 'Owner allowlist for command overrides.',
    keywords: ['bot owners', 'owner override', 'ids'],
    isAdvanced: true,
  },
  {
    id: 'community-tools-toggles',
    featureId: 'community-tools',
    categoryId: 'community-tools',
    label: 'Community Tool Toggles',
    description: 'Help, announce, snippet, poll, showcase, review.',
    keywords: ['help', 'announce', 'snippet', 'poll', 'showcase', 'review'],
    isAdvanced: false,
  },
  {
    id: 'tickets-core',
    featureId: 'tickets',
    categoryId: 'support-integrations',
    label: 'Tickets Core Settings',
    description: 'Ticket mode and support role/category.',
    keywords: ['tickets', 'support role', 'category', 'mode'],
    isAdvanced: false,
  },
  {
    id: 'tickets-limits',
    featureId: 'tickets',
    categoryId: 'support-integrations',
    label: 'Ticket Limits',
    description: 'Auto-close and max-open constraints.',
    keywords: ['auto close', 'max open', 'transcript'],
    isAdvanced: true,
  },
  {
    id: 'github-feed-core',
    featureId: 'github-feed',
    categoryId: 'support-integrations',
    label: 'Github Feed Settings',
    description: 'Configure repository feed channel and polling.',
    keywords: ['github', 'feed', 'poll interval', 'channel'],
    isAdvanced: false,
  },
  {
    id: 'audit-log-enabled',
    featureId: 'audit-log',
    categoryId: 'moderation-safety',
    label: 'Enable Audit Log',
    description: 'Record all admin actions taken in the dashboard.',
    keywords: ['audit', 'log', 'history', 'admin actions', 'trail'],
    isAdvanced: false,
  },
  {
    id: 'audit-log-retention',
    featureId: 'audit-log',
    categoryId: 'moderation-safety',
    label: 'Audit Log Retention',
    description: 'Configure how long audit entries are kept before auto-purge.',
    keywords: ['audit', 'retention', 'purge', 'days', 'cleanup'],
    isAdvanced: true,
  },
  {
    id: 'bot-status-enabled',
    featureId: 'bot-status',
    categoryId: 'community-tools',
    label: 'Bot Presence Rotation',
    description: 'Configure rotating bot status messages and interval.',
    keywords: ['bot status', 'presence', 'rotation', 'activity'],
    isAdvanced: false,
  },
];

/**
 * Retrieve a configuration category by its id.
 *
 * @param categoryId - The id of the configuration category to look up
 * @returns The matching ConfigCategoryMeta, or the first category as a fallback if no match is found
 */
export function getCategoryById(categoryId: ConfigCategoryId): ConfigCategoryMeta {
  const found = CONFIG_CATEGORIES.find((category) => category.id === categoryId);
  if (!found) {
    logger.warn(`getCategoryById: unknown categoryId "${categoryId}", falling back to default.`);
    return CONFIG_CATEGORIES.find((c) => c.id === DEFAULT_CONFIG_CATEGORY) ?? CONFIG_CATEGORIES[0];
  }
  return found;
}

/**
 * Retrieve the configuration category that contains the given feature id.
 *
 * @param featureId - The feature identifier to look up
 * @returns The matching ConfigCategoryMeta, or the first category as a fallback if none contains `featureId`
 */
export function getCategoryByFeature(featureId: ConfigFeatureId): ConfigCategoryMeta {
  return (
    CONFIG_CATEGORIES.find((category) => category.featureIds.includes(featureId)) ??
    CONFIG_CATEGORIES[0]
  );
}

/**
 * Find configuration search items that match a text query.
 *
 * The query is trimmed and matched case-insensitively against each item's label, description, and keywords.
 *
 * @param query - The search text to match (leading/trailing whitespace is ignored)
 * @returns The matching search items
 */
export function getMatchingSearchItems(query: string): ConfigSearchItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return CONFIG_SEARCH_ITEMS.filter((item) => {
    const haystacks = [item.label, item.description, ...item.keywords];
    return haystacks.some((value) => value.toLowerCase().includes(normalized));
  });
}

/**
 * Collects feature IDs from configuration search items that match a query.
 *
 * @param query - The search string used to match item labels, descriptions, and keywords
 * @returns A Set of feature IDs corresponding to configuration search items that match `query`
 */
export function getMatchedFeatureIds(query: string): Set<ConfigFeatureId> {
  const matches = getMatchingSearchItems(query);
  return new Set(matches.map((item) => item.featureId));
}
