import type { ReactNode } from 'react';
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
  | 'engagement'
  | 'tldr-afk'
  | 'challenges'
  | 'moderation'
  | 'starboard'
  | 'permissions'
  | 'community-tools'
  | 'tickets'
  | 'github-feed';

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

export interface ConfigWorkspaceProps {
  categoryId: ConfigCategoryId;
  onCategoryChange: (categoryId: ConfigCategoryId) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  changedSections: string[];
  children: ReactNode;
}
