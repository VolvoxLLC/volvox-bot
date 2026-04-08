import {
  Activity,
  Bot,
  BrainCircuit,
  Handshake,
  Key,
  ListChecks,
  MessageSquare,
  ScrollText,
  ShieldAlert,
  Sparkles,
  Star,
  Swords,
  Target,
  Ticket,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { GithubIcon } from '@/components/ui/github-icon';
import type { ConfigCategoryId, ConfigFeatureId } from './types';

export type NavIcon = ComponentType<{ className?: string }>;

export interface ConfigTabMeta {
  id: ConfigFeatureId;
  label: string;
  icon: NavIcon;
  desc: string;
}

export interface ConfigCategoryNav {
  id: ConfigCategoryId;
  label: string;
  icon: NavIcon;
  description: string;
  tabs: ConfigTabMeta[];
}

export const CONFIG_NAVIGATION: ConfigCategoryNav[] = [
  {
    id: 'ai-automation',
    label: 'AI & Automation',
    icon: Sparkles,
    description: 'AI chat, auto-moderation, triage, and memory behavior.',
    tabs: [
      {
        id: 'ai-chat',
        label: 'AI Chat',
        icon: Bot,
        desc: 'Configure conversational AI models & behavior.',
      },
      {
        id: 'ai-automod',
        label: 'Content Safety',
        icon: ShieldAlert,
        desc: 'Real-time message analysis & mitigation.',
      },
      {
        id: 'triage',
        label: 'Triage',
        icon: ListChecks,
        desc: 'Advanced classifier & responder orchestration.',
      },
      {
        id: 'memory',
        label: 'Memory',
        icon: BrainCircuit,
        desc: 'Configure contextual storage & retrieval.',
      },
    ],
  },
  {
    id: 'onboarding-growth',
    label: 'Onboarding & Growth',
    icon: Users,
    description: 'Welcome flow, XP systems, challenges, and lightweight automation.',
    tabs: [
      {
        id: 'welcome',
        label: 'Welcome',
        icon: Handshake,
        desc: 'Greet and onboard new members with context-aware messages and automated role assignments.',
      },
      {
        id: 'engagement',
        label: 'Engagement',
        icon: Target,
        desc: 'Configure profile activity tiers and engagement tracking behavior.',
      },
      {
        id: 'reputation',
        label: 'Reputation',
        icon: Zap,
        desc: 'Tune XP ranges, cooldowns, and progression thresholds.',
      },
      {
        id: 'xp-level-actions',
        label: 'Level Actions',
        icon: Swords,
        desc: 'Configure automatic rewards when members level up.',
      },
      {
        id: 'tldr-afk',
        label: 'TL;DR & AFK',
        icon: MessageSquare,
        desc: 'Quick toggles for summary and away-state features.',
      },
      {
        id: 'challenges',
        label: 'Challenges',
        icon: Swords,
        desc: 'Auto-post a daily challenge with solve tracking.',
      },
    ],
  },
  {
    id: 'moderation-safety',
    label: 'Moderation & Safety',
    icon: ShieldAlert,
    description: 'Moderation actions, starboard policy, role permissions, and audit logging.',
    tabs: [
      {
        id: 'moderation',
        label: 'Moderation',
        icon: ShieldAlert,
        desc: 'Configure moderation alerts, notification behavior, and enforcement rules.',
      },
      {
        id: 'starboard',
        label: 'Starboard',
        icon: Star,
        desc: 'Pin popular messages to a starboard channel.',
      },
      {
        id: 'permissions',
        label: 'Permissions',
        icon: Key,
        desc: 'Configure role-based access and owner overrides.',
      },
      {
        id: 'audit-log',
        label: 'Audit Log',
        icon: ScrollText,
        desc: 'Record admin actions taken via the dashboard.',
      },
    ],
  },
  {
    id: 'community-tools',
    label: 'Community Tools',
    icon: Bot,
    description: 'Member-facing utility commands and review workflows.',
    tabs: [
      {
        id: 'community-tools',
        label: 'Community Tools',
        icon: Wrench,
        desc: 'Enable or disable member-facing commands for this guild.',
      },
      {
        id: 'bot-status',
        label: 'Bot Presence',
        icon: Activity,
        desc: 'Set bot presence and rotate status messages.',
      },
    ],
  },
  {
    id: 'support-integrations',
    label: 'Support & Integrations',
    icon: Ticket,
    description: 'Tickets and Github activity automation.',
    tabs: [
      {
        id: 'tickets',
        label: 'Tickets',
        icon: Ticket,
        desc: 'Configure support ticket routing and lifecycle limits.',
      },
      {
        id: 'github-feed',
        label: 'GitHub Feed',
        icon: GithubIcon,
        desc: 'Post repository updates into a Discord channel.',
      },
    ],
  },
];
