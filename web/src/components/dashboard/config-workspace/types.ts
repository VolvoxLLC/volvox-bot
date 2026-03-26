import type { ConfigSection } from '@/types/config';

export type ConfigCategoryId =
  | 'ai-automation'
  | 'onboarding-growth'
  | 'moderation-safety'
  | 'community-tools'
  | 'support-integrations';

export type ConfigCategoryIcon = 'sparkles' | 'users' | 'message-square-warning' | 'bot' | 'ticket';

export type ConfigFeatureId =
  | 'ai-chat'
  | 'ai-automod'
  | 'triage'
  | 'memory'
  | 'welcome'
  | 'reputation'
  | 'xp-level-actions'
  | 'engagement'
  | 'tldr-afk'
  | 'challenges'
  | 'moderation'
  | 'starboard'
  | 'permissions'
  | 'community-tools'
  | 'tickets'
  | 'github-feed'
  | 'audit-log'
  | 'bot-status';

export type ConfigSectionKey = ConfigSection | 'aiAutoMod';

export interface ConfigCategoryMeta {
  id: ConfigCategoryId;
  icon: ConfigCategoryIcon;
  label: string;
  description: string;
  sectionKeys: ConfigSectionKey[];
  featureIds: ConfigFeatureId[];
}

export interface ConfigSearchItem {
  id: string;
  featureId: ConfigFeatureId;
  categoryId: ConfigCategoryId;
  label: string;
  description: string;
  keywords: string[];
  isAdvanced: boolean;
}
