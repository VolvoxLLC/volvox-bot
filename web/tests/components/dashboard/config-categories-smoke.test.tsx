import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuildConfig } from '@/components/dashboard/config-editor-utils';

const mockUseConfigContext = vi.fn();
const baseConfig: GuildConfig = {
  ai: { enabled: true, systemPrompt: 'Be helpful', blockedChannelIds: [] },
  moderation: {
    enabled: true,
    alertChannelId: 'reports',
    autoDelete: true,
    logging: { channels: { default: 'logs' } },
    dmNotifications: { warn: true, timeout: true, kick: true, ban: true },
    escalation: { enabled: true, thresholds: [] },
  },
  permissions: {
    enabled: true,
    adminRoleIds: ['admin'],
    moderatorRoleIds: ['mod'],
    modRoles: ['mod'],
    usePermissions: true,
    allowedCommands: {},
  },
  auditLog: { enabled: true, retentionDays: 90 },
  tickets: {
    enabled: true,
    mode: 'thread',
    category: 'tickets',
    supportRole: 'support',
    transcriptChannel: 'transcripts',
    autoCloseHours: 48,
    maxOpenPerUser: 3,
  },
  github: {
    feed: {
      enabled: true,
      channelId: 'github',
      repos: ['VolvoxLLC/volvox-bot'],
      events: ['push'],
      pollIntervalMinutes: 5,
    },
  },
  starboard: {
    enabled: true,
    channelId: 'stars',
    threshold: 3,
    emoji: '⭐',
    selfStarAllowed: false,
    ignoredChannels: [],
  },
  botStatus: {
    enabled: true,
    rotation: { enabled: true, intervalMinutes: 30, messages: [{ text: 'Watching tests' }] },
  },
  showcase: { enabled: true },
  memory: { enabled: true, maxContextMemories: 10, autoExtract: true },
  engagement: {
    enabled: true,
    trackMessages: true,
    trackReactions: true,
    activityBadges: [{ days: 7, label: 'Regular' }],
  },
  challenges: {
    enabled: true,
    channelId: 'challenges',
    postTime: '09:00',
    timezone: 'America/New_York',
  },
};

const updateDraftConfig = vi.fn((updater: (config: GuildConfig) => GuildConfig) => updater(baseConfig));

vi.mock('@/components/dashboard/config-context', () => ({
  useConfigContext: () => mockUseConfigContext(),
}));

vi.mock('@/components/ui/channel-selector', () => ({
  ChannelSelector: ({ id, placeholder }: { id?: string; placeholder?: string }) => (
    <div data-testid={id ? `channel-selector-${id}` : 'channel-selector'}>{placeholder}</div>
  ),
}));

vi.mock('@/components/ui/role-selector', () => ({
  RoleSelector: ({ id }: { id?: string }) => <div data-testid={id ?? 'role-selector'} />,
}));

vi.mock('@/components/ui/discord-markdown-editor', () => ({
  DiscordMarkdownEditor: ({ label, value }: { label?: string; value?: string }) => (
    <textarea aria-label={label ?? 'discord markdown'} defaultValue={value} />
  ),
}));

vi.mock('@/components/ui/embed-builder', () => ({
  defaultEmbedConfig: () => ({
    title: '',
    description: '',
    color: '#5865f2',
    fields: [],
    format: 'embed',
    showTimestamp: false,
  }),
  EmbedBuilder: ({ value }: { value: { description?: string } }) => (
    <div data-testid="embed-builder">{value.description}</div>
  ),
}));

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>{children}</button>
  ),
}));

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/settings',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { CommunityToolsCategory } from '@/components/dashboard/config-categories/community-tools';
import { ConfigLandingContent } from '@/components/dashboard/config-categories/config-landing';
import { ModerationSafetyCategory } from '@/components/dashboard/config-categories/moderation-safety';
import { SupportIntegrationsCategory } from '@/components/dashboard/config-categories/support-integrations';
import { AuditLogSection } from '@/components/dashboard/config-sections/AuditLogSection';
import { ChallengesSection } from '@/components/dashboard/config-sections/ChallengesSection';
import { CommunityFeaturesSection } from '@/components/dashboard/config-sections/CommunityFeaturesSection';
import { EngagementSection } from '@/components/dashboard/config-sections/EngagementSection';
import { GitHubSection } from '@/components/dashboard/config-sections/GitHubSection';
import { MemorySection } from '@/components/dashboard/config-sections/MemorySection';
import { PermissionsSection } from '@/components/dashboard/config-sections/PermissionsSection';
import { StarboardSection } from '@/components/dashboard/config-sections/StarboardSection';
import { TicketsSection } from '@/components/dashboard/config-sections/TicketsSection';
import { CategoryNavigation } from '@/components/dashboard/config-workspace/category-navigation';
import { ConfigSearch } from '@/components/dashboard/config-workspace/config-search';
import { SettingsFeatureCard } from '@/components/dashboard/config-workspace/settings-feature-card';

const dirtyCounts = {
  'ai-automation': 2,
  'moderation-safety': 0,
  'onboarding-growth': 0,
  'community-tools': 0,
  'support-integrations': 0,
};

const featureCategoryByTabId: Record<string, string> = {
  'ai-automod': 'moderation-safety',
  moderation: 'moderation-safety',
  permissions: 'moderation-safety',
  'audit-log': 'moderation-safety',
  'community-tools': 'community-tools',
  starboard: 'community-tools',
  'bot-status': 'community-tools',
  tickets: 'support-integrations',
  'github-feed': 'support-integrations',
};

function setConfigContext(activeTabId: string) {
  mockUseConfigContext.mockReturnValue({
    draftConfig: baseConfig,
    savedConfig: baseConfig,
    saving: false,
    guildId: 'guild-1',
    activeTabId,
    activeCategoryId: featureCategoryByTabId[activeTabId] ?? activeTabId,
    visibleFeatureIds: new Set([activeTabId]),
    dirtyCategoryCounts: dirtyCounts,
    updateDraftConfig,
    handleSearchSelect: vi.fn(),
  });
}

describe('dashboard config coverage smoke tests', () => {
  it.each([
    ['ai-automod', ModerationSafetyCategory, 'Detection Model'],
    ['moderation', ModerationSafetyCategory, 'Moderation'],
    ['permissions', ModerationSafetyCategory, 'Permissions'],
    ['audit-log', ModerationSafetyCategory, 'Audit Log'],
    ['community-tools', CommunityToolsCategory, 'Community Tools'],
    ['starboard', CommunityToolsCategory, 'Starboard'],
    ['bot-status', CommunityToolsCategory, 'Bot Presence'],
    ['tickets', SupportIntegrationsCategory, 'Tickets'],
    ['github-feed', SupportIntegrationsCategory, 'GitHub'],
  ])('renders %s config category', (activeTabId, Component, expectedText) => {
    setConfigContext(activeTabId);

    render(<Component />);

    expect(document.body.textContent).toMatch(new RegExp(expectedText, 'i'));
  });

  it('renders the config landing and workspace navigation primitives', () => {
    setConfigContext('moderation');

    render(
      <>
        <ConfigLandingContent />
        <CategoryNavigation dirtyCounts={dirtyCounts} />
        <ConfigSearch
          value="ai"
          onChange={vi.fn()}
          results={[{ id: 'ai-chat-enabled', label: 'Enable AI Chat', categoryId: 'ai-automation', featureId: 'ai-chat', description: 'Toggle AI chat', keywords: ['ai'], isAdvanced: false }]}
          onSelect={vi.fn()}
        />
        <SettingsFeatureCard
          featureId="ai-chat"
          title="AI Chat"
          description="Toggle AI replies"
          basicContent={<span>AI Chat settings</span>}
          enabled
        />
      </>,
    );

    expect(document.body.textContent).toMatch(/Select a category/i);
    expect(document.body.textContent).toMatch(/AI Chat/i);
  });

  it('renders reusable config sections with enabled drafts', () => {
    render(
      <>
        <AuditLogSection
          draftConfig={baseConfig}
          saving={false}
          onEnabledChange={vi.fn()}
          onRetentionDaysChange={vi.fn()}
        />
        <ChallengesSection
          draftConfig={baseConfig}
          saving={false}
          onEnabledChange={vi.fn()}
          onFieldChange={vi.fn()}
        />
        <CommunityFeaturesSection
          draftConfig={baseConfig}
          saving={false}
          onToggleChange={vi.fn()}
        />
        <EngagementSection
          draftConfig={baseConfig}
          saving={false}
          onActivityBadgesChange={vi.fn()}
        />
        <GitHubSection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
        <MemorySection
          draftConfig={baseConfig}
          saving={false}
          onEnabledChange={vi.fn()}
          onFieldChange={vi.fn()}
        />
        <PermissionsSection
          draftConfig={baseConfig}
          guildId="guild-1"
          saving={false}
          onFieldChange={vi.fn()}
        />
        <StarboardSection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
        <TicketsSection
          draftConfig={baseConfig}
          saving={false}
          onEnabledChange={vi.fn()}
          onFieldChange={vi.fn()}
        />
      </>,
    );

    expect(document.body.textContent).toMatch(/Enable/i);
    expect(document.body.textContent).toMatch(/GitHub/i);
    expect(document.body.textContent).toMatch(/Ticket/i);
  });
});
