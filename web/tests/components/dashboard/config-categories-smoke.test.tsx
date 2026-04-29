import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuildConfig } from '@/components/dashboard/config-editor-utils';

const mockUseConfigContext = vi.fn();
const updateDraftConfig = vi.fn((updater: (config: GuildConfig) => GuildConfig) => updater(baseConfig));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/settings/moderation-safety',
  useRouter: () => ({ push: vi.fn() }),
}));

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

const baseConfig: GuildConfig = {
  ai: { enabled: true, systemPrompt: 'Be helpful', blockedChannelIds: [] },
  moderation: {
    enabled: true,
    logChannelId: 'logs',
    reportChannelId: 'reports',
    modRoleIds: ['mods'],
    autoDeleteThreshold: 3,
    muteDuration: '10m',
  },
  permissions: { enabled: true, botOwners: ['owner'], adminRoleIds: ['admin'], moderatorRoleIds: ['mod'] },
  auditLog: { enabled: true, channelId: 'audit' },
  tickets: { enabled: true, categoryId: 'tickets', logChannelId: 'ticket-log', supportRoleIds: ['support'], transcriptChannelId: 'transcripts' },
  github: { enabled: true, repo: 'VolvoxLLC/volvox-bot', channelId: 'github' },
  starboard: { enabled: true, channelId: 'stars', threshold: 3, emoji: '⭐' },
  botStatus: { enabled: true, channelId: 'status', intervalMinutes: 30 },
  community: { showcaseEnabled: true, showcaseChannelId: 'showcase' },
  memory: { enabled: true, ttlDays: 30 },
  engagement: { enabled: true, xpPerMessage: 5, cooldownSeconds: 60 },
  challenges: { enabled: true, channelId: 'challenges' },
};

function setConfigContext(activeTabId: string) {
  mockUseConfigContext.mockReturnValue({
    draftConfig: baseConfig,
    savedConfig: baseConfig,
    saving: false,
    guildId: 'guild-1',
    activeTabId,
    activeCategoryId: 'moderation-safety',
    visibleFeatureIds: new Set([activeTabId]),
    dirtyCategoryCounts: {
      'ai-automation': 2,
      'moderation-safety': 0,
      'onboarding-growth': 0,
      'community-tools': 0,
      'support-integrations': 0,
    },
    updateDraftConfig,
    handleSearchSelect: vi.fn(),
  });
}

describe('dashboard config coverage smoke tests', () => {
  it.each([
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
        <CategoryNavigation dirtyCounts={{ 'ai-automation': 2 }} />
        <ConfigSearch
          value="ai"
          onChange={vi.fn()}
          results={[{ id: 'ai-chat-enabled', label: 'Enable AI Chat', categoryId: 'ai-automation', featureId: 'ai-chat', description: 'Toggle AI chat', keywords: ['ai'], isAdvanced: false }]}
          onSelect={vi.fn()}
        />
        <SettingsFeatureCard title="AI Chat" description="Toggle AI replies" href="/dashboard/settings/ai-automation" dirtyCount={1} />
      </>,
    );

    expect(document.body.textContent).toMatch(/Select a category/i);
    expect(document.body.textContent).toMatch(/AI Chat/i);
  });

  it('renders reusable config sections with enabled drafts', () => {
    render(
      <>
        <AuditLogSection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
        <ChallengesSection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
        <CommunityFeaturesSection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
        <EngagementSection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
        <GitHubSection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
        <MemorySection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
        <PermissionsSection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
        <StarboardSection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
        <TicketsSection draftConfig={baseConfig} saving={false} onFieldChange={vi.fn()} />
      </>,
    );

    expect(document.body.textContent).toMatch(/Enable/i);
    expect(document.body.textContent).toMatch(/GitHub/i);
    expect(document.body.textContent).toMatch(/Ticket/i);
  });
});
