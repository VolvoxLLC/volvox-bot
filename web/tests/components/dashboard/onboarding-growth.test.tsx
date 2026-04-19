import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const mockUseConfigContext = vi.fn();

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock('@/components/dashboard/config-context', () => ({
  useConfigContext: () => mockUseConfigContext(),
}));

vi.mock('@/components/ui/channel-selector', () => ({
  ChannelSelector: () => <div data-testid="channel-selector" />,
}));

vi.mock('@/components/ui/role-selector', () => ({
  RoleSelector: () => <div data-testid="role-selector" />,
}));

vi.mock('@/components/dashboard/config-categories/config-category-layout', () => ({
  ConfigCategoryLayout: ({
    children,
    toggle,
  }: {
    children: React.ReactNode;
    toggle?: { checked: boolean; onChange: (checked: boolean) => void; label?: string } | null;
  }) => (
    <>
      {toggle && (
        <button type="button" onClick={() => toggle.onChange(!toggle.checked)}>
          {toggle.label ?? 'Toggle current feature'}
        </button>
      )}
      {children}
    </>
  ),
}));

vi.mock('@/components/dashboard/toggle-switch', () => ({
  ToggleSwitch: ({
    checked,
    label,
    onChange,
  }: {
    checked: boolean;
    label: string;
    onChange: (checked: boolean) => void;
  }) => (
    <button type="button" onClick={() => onChange(!checked)}>
      {label}
    </button>
  ),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/discord-markdown-editor', () => ({
  DiscordMarkdownEditor: ({
    placeholder,
    value,
  }: {
    placeholder?: string;
    value?: string;
  }) => (
    <div
      data-testid="discord-markdown-editor"
      data-placeholder={placeholder}
      data-value={value}
    />
  ),
}));

import { OnboardingGrowthCategory } from '@/components/dashboard/config-categories/onboarding-growth';

describe('OnboardingGrowthCategory', () => {
  it('shows the full dynamic variable guide for welcome messages', async () => {
    const user = userEvent.setup();

    mockUseConfigContext.mockReturnValue({
      draftConfig: {
        welcome: {
          enabled: true,
          message: '',
          dynamic: { enabled: false },
          roleMenu: { options: [] },
          dmSequence: { steps: [] },
        },
      },
      saving: false,
      guildId: 'guild-1',
      visibleFeatureIds: new Set(['welcome']),
      activeTabId: 'welcome',
      updateDraftConfig: vi.fn(),
    });

    render(<OnboardingGrowthCategory />);

    await user.click(screen.getByText('View Variables Guide'));

    [
      '{{greeting}}',
      '{{vibeLine}}',
      '{{ctaLine}}',
      '{{milestoneLine}}',
      '{{timeOfDay}}',
      '{{activityLevel}}',
      '{{topChannels}}',
    ].forEach((variable) => {
      expect(screen.getByText(variable)).toBeInTheDocument();
    });
  });

  it('uses double-brace variables in the welcome editor placeholder', () => {
    mockUseConfigContext.mockReturnValue({
      draftConfig: {
        welcome: {
          enabled: true,
          message: '',
          dynamic: { enabled: false },
          roleMenu: { options: [] },
          dmSequence: { steps: [] },
        },
      },
      saving: false,
      guildId: 'guild-1',
      visibleFeatureIds: new Set(['welcome']),
      activeTabId: 'welcome',
      updateDraftConfig: vi.fn(),
    });

    render(<OnboardingGrowthCategory />);

    expect(screen.getByTestId('discord-markdown-editor')).toHaveAttribute(
      'data-placeholder',
      'Welcome {{user}} to {{server}}!',
    );
  });

  it('mounts the level-up actions editor from the xp-level-actions tab', () => {
    mockUseConfigContext.mockReturnValue({
      draftConfig: {
        xp: {
          enabled: true,
          defaultActions: [{ id: 'default-1', type: 'xpBonus', amount: 100 }],
          levelActions: [{ id: 'level-5', level: 5, actions: [] }],
        },
        reputation: { enabled: true },
      },
      saving: false,
      guildId: 'guild-1',
      visibleFeatureIds: new Set(['xp-level-actions']),
      activeTabId: 'xp-level-actions',
      updateDraftConfig: vi.fn(),
    });

    render(<OnboardingGrowthCategory />);

    expect(screen.getAllByText('Default Actions').length).toBeGreaterThan(0);
    expect(screen.getByText('Per-Level Actions')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Level/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Grant XP Bonus' })).toBeInTheDocument();
  });

  it('toggles xp and reputation for the level-up actions tab', async () => {
    const user = userEvent.setup();
    const updateDraftConfig = vi.fn((updater) =>
      updater({
        xp: { enabled: false, defaultActions: [], levelActions: [] },
        reputation: { enabled: false },
      }),
    );

    mockUseConfigContext.mockReturnValue({
      draftConfig: {
        xp: { enabled: false, defaultActions: [], levelActions: [] },
        reputation: { enabled: false },
      },
      saving: false,
      guildId: 'guild-1',
      visibleFeatureIds: new Set(['xp-level-actions']),
      activeTabId: 'xp-level-actions',
      updateDraftConfig,
    });

    render(<OnboardingGrowthCategory />);

    await user.click(screen.getByRole('button', { name: 'Toggle current feature' }));

    expect(updateDraftConfig).toHaveBeenCalledTimes(1);
    expect(updateDraftConfig.mock.results[0]?.value).toEqual({
      xp: { enabled: true, defaultActions: [], levelActions: [] },
      reputation: { enabled: true },
    });
  });

  it('hydrates legacy action templates into editor messages', () => {
    mockUseConfigContext.mockReturnValue({
      draftConfig: {
        xp: {
          enabled: true,
          defaultActions: [{ id: 'default-1', type: 'sendDm', template: 'Saved {{level}}' }],
          levelActions: [],
        },
        reputation: { enabled: true },
      },
      saving: false,
      guildId: 'guild-1',
      visibleFeatureIds: new Set(['xp-level-actions']),
      activeTabId: 'xp-level-actions',
      updateDraftConfig: vi.fn(),
    });

    render(<OnboardingGrowthCategory />);

    expect(screen.getByTestId('discord-markdown-editor')).toHaveAttribute(
      'data-value',
      'Saved {{level}}',
    );
  });
});
