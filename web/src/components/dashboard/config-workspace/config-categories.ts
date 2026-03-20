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
    description: 'AI chat, auto-moderation, triage, and memory behavior.',
    sectionKeys: ['ai', 'aiAutoMod', 'triage', 'memory'],
    featureIds: ['ai-chat', 'ai-automod', 'triage', 'memory'],
  },
  {
    id: 'onboarding-growth',
    icon: 'users',
    label: 'Onboarding & Growth',
    description: 'Welcome flow, XP systems, challenges, and lightweight automation.',
    sectionKeys: ['welcome', 'reputation', 'engagement', 'tldr', 'afk', 'challenges'],
    featureIds: ['welcome', 'reputation', 'engagement', 'tldr-afk', 'challenges'],
  },
  {
    id: 'moderation-safety',
    icon: 'message-square-warning',
    label: 'Moderation & Safety',
    description: 'Moderation actions, starboard policy, role permissions, and audit logging.',
    sectionKeys: ['moderation', 'starboard', 'permissions', 'auditLog'],
    featureIds: ['moderation', 'starboard', 'permissions', 'audit-log'],
  },
  {
    id: 'community-tools',
    icon: 'bot',
    label: 'Community Tools',
    description: 'Member-facing utility commands and review workflows.',
    sectionKeys: ['help', 'announce', 'snippet', 'poll', 'showcase', 'review', 'botStatus'],
    featureIds: ['community-tools', 'bot-status'],
  },
  {
    id: 'support-integrations',
    icon: 'ticket',
    label: 'Support & Integrations',
    description: 'Tickets and GitHub activity automation.',
    sectionKeys: ['tickets', 'github'],
    featureIds: ['tickets', 'github-feed'],
  },
];

export const DEFAULT_CONFIG_CATEGORY: ConfigCategoryId = 'ai-automation';

export const FEATURE_LABELS: Record<ConfigFeatureId, string> = {
  'ai-chat': 'AI Chat',
  'ai-automod': 'AI Auto-Moderation',
  triage: 'Triage',
  memory: 'Memory',
  welcome: 'Welcome Messages',
  reputation: 'Reputation / XP',
  engagement: 'Activity Badges',
  'tldr-afk': 'TL;DR & AFK',
  challenges: 'Daily Coding Challenges',
  moderation: 'Moderation',
  starboard: 'Starboard',
  permissions: 'Permissions',
  'community-tools': 'Community Command Toggles',
  tickets: 'Tickets',
  'github-feed': 'GitHub Activity Feed',
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
    categoryId: 'ai-automation',
    label: 'Enable AI Auto-Moderation',
    description: 'Enable Claude-driven moderation actions.',
    keywords: ['ai automod', 'toxicity', 'spam', 'harassment'],
    isAdvanced: false,
  },
  {
    id: 'ai-automod-thresholds',
    featureId: 'ai-automod',
    categoryId: 'ai-automation',
    label: 'AI Thresholds',
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
    description: 'Streaming, debug footer, status reactions.',
    keywords: ['debug', 'streaming', 'status reactions', 'footer'],
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
    description: 'Tune XP gain and cooldown.',
    keywords: ['reputation', 'xp', 'leveling', 'cooldown'],
    isAdvanced: false,
  },
  {
    id: 'reputation-thresholds',
    featureId: 'reputation',
    categoryId: 'onboarding-growth',
    label: 'Level Thresholds',
    description: 'Customize XP requirements per level.',
    keywords: ['thresholds', 'level', 'xp values'],
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
    categoryId: 'moderation-safety',
    label: 'Starboard Core Settings',
    description: 'Set channel and threshold for starboard posts.',
    keywords: ['starboard', 'threshold', 'channel'],
    isAdvanced: false,
  },
  {
    id: 'starboard-advanced',
    featureId: 'starboard',
    categoryId: 'moderation-safety',
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
    label: 'GitHub Feed Settings',
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
