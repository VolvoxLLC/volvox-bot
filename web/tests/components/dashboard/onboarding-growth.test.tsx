import { fireEvent, render, screen } from '@testing-library/react';
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
  ChannelSelector: ({
    id,
    onChange,
    placeholder,
    selected,
  }: {
    id?: string;
    onChange: (selected: string[]) => void;
    placeholder?: string;
    selected: string[];
  }) => (
    <button
      type="button"
      data-placeholder={placeholder}
      data-selected={selected.join(',')}
      data-testid={id ? `channel-selector-${id}` : 'channel-selector'}
      onClick={() => onChange(['new-channel'])}
    >
      {placeholder ?? id ?? 'channel-selector'}
    </button>
  ),
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
    toggle?: {
      checked: boolean;
      disabled?: boolean;
      onChange: (checked: boolean) => void;
      label?: string;
    } | null;
  }) => (
    <>
      {toggle && (
        <button
          type="button"
          disabled={toggle.disabled}
          onClick={() => {
            if (!toggle.disabled) {
              toggle.onChange(!toggle.checked);
            }
          }}
        >
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
    disabled,
    label,
    onChange,
  }: {
    checked: boolean;
    disabled?: boolean;
    label: string;
    onChange: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onChange(!checked);
        }
      }}
    >
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

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    onSelect,
    value,
  }: {
    children: React.ReactNode;
    onSelect?: () => void;
    value?: string;
  }) => (
    <button type="button" role="option" aria-label={value} onClick={onSelect}>
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

vi.mock('@/components/ui/embed-builder', () => ({
  defaultEmbedConfig: () => ({
    color: '#5865F2',
    title: '',
    description: '',
    thumbnailType: 'none',
    thumbnailUrl: '',
    fields: [],
    footerText: '',
    footerIconUrl: '',
    imageUrl: '',
    showTimestamp: false,
    format: 'embed',
  }),
  EmbedBuilder: ({ value }: { value: { description?: string; format?: string } }) => (
    <div data-testid="embed-builder" data-description={value.description} data-format={value.format} />
  ),
}));

import { OnboardingGrowthCategory } from '@/components/dashboard/config-categories/onboarding-growth';
import { XpLevelActionsEditor } from '@/components/dashboard/xp-level-actions-editor';

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

  it('exposes a channel selector for the welcome message destination', async () => {
    const user = userEvent.setup();
    const updateDraftConfig = vi.fn((updater) =>
      updater({
        welcome: {
          enabled: true,
          channelId: 'old-channel',
          message: '',
          dynamic: { enabled: false },
          roleMenu: { options: [] },
          dmSequence: { steps: [] },
        },
      }),
    );

    mockUseConfigContext.mockReturnValue({
      draftConfig: {
        welcome: {
          enabled: true,
          channelId: 'old-channel',
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
      updateDraftConfig,
    });

    render(<OnboardingGrowthCategory />);

    expect(screen.getByText('Message Channel')).toBeInTheDocument();

    const selector = screen.getByTestId('channel-selector-welcome-channel-id');
    expect(selector).toHaveAttribute('data-selected', 'old-channel');
    expect(selector).toHaveAttribute('data-placeholder', 'Select welcome message channel');

    await user.click(selector);

    expect(updateDraftConfig).toHaveBeenCalledTimes(1);
    expect(updateDraftConfig.mock.results[0]?.value.welcome.channelId).toBe('new-channel');
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
    expect(screen.getByRole('option', { name: /Grant XP Bonus/ })).toBeInTheDocument();
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

describe('XpLevelActionsEditor', () => {
  it('initializes an embed when switching a message action to embed format', async () => {
    const user = userEvent.setup();
    const updateDraftConfig = vi.fn((updater) =>
      updater({
        xp: {
          defaultActions: [
            { id: 'action-1', type: 'sendDm', format: 'text', message: 'Saved {{level}}' },
          ],
          levelActions: [],
        },
      }),
    );

    render(
      <XpLevelActionsEditor
        draftConfig={{
          xp: {
            defaultActions: [
              { id: 'action-1', type: 'sendDm', format: 'text', message: 'Saved {{level}}' },
            ],
            levelActions: [],
          },
        }}
        guildId="guild-1"
        saving={false}
        updateDraftConfig={updateDraftConfig}
      />,
    );

    await user.click(screen.getByRole('option', { name: /Embed embed/ }));

    expect(updateDraftConfig).toHaveBeenCalledTimes(1);
    expect(updateDraftConfig.mock.results[0]?.value.xp.defaultActions[0]).toMatchObject({
      format: 'embed',
      embed: { description: 'Saved {{level}}' },
    });
  });

  it('clamps bonus XP to the backend maximum', () => {
    const updateDraftConfig = vi.fn((updater) =>
      updater({
        xp: {
          defaultActions: [{ id: 'action-1', type: 'xpBonus', amount: 100 }],
          levelActions: [],
        },
      }),
    );

    render(
      <XpLevelActionsEditor
        draftConfig={{
          xp: {
            defaultActions: [{ id: 'action-1', type: 'xpBonus', amount: 100 }],
            levelActions: [],
          },
        }}
        guildId="guild-1"
        saving={false}
        updateDraftConfig={updateDraftConfig}
      />,
    );

    const bonusInput = screen.getByLabelText('Bonus XP');
    expect(bonusInput).toHaveAttribute('max', '1000000');

    fireEvent.change(bonusInput, { target: { value: '1000001' } });

    expect(updateDraftConfig.mock.results[0]?.value.xp.defaultActions[0]).toMatchObject({
      amount: 1_000_000,
    });
  });

  it('shows webhook template variables with user and server ids', () => {
    render(
      <XpLevelActionsEditor
        draftConfig={{
          xp: {
            defaultActions: [{ id: 'action-1', type: 'webhook', url: '', payload: '' }],
            levelActions: [],
          },
        }}
        guildId="guild-1"
        saving={false}
        updateDraftConfig={vi.fn()}
      />,
    );

    expect(screen.getByText('{{userId}}')).toBeInTheDocument();
    expect(screen.getByText('{{serverId}}')).toBeInTheDocument();
    expect(screen.getByText('{{serverName}}')).toBeInTheDocument();
    expect(screen.queryByText('{{server}}')).not.toBeInTheDocument();
  });

  it('recomputes the next unused level from the latest updater state', () => {
    const updateDraftConfig = vi.fn((updater) =>
      updater({
        xp: {
          defaultActions: [],
          levelActions: [{ id: 'level-1', level: 1, actions: [] }],
        },
      }),
    );

    render(
      <XpLevelActionsEditor
        draftConfig={{
          xp: {
            defaultActions: [],
            levelActions: [],
          },
        }}
        guildId="guild-1"
        saving={false}
        updateDraftConfig={updateDraftConfig}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Add Level/i }));

    expect(updateDraftConfig.mock.results[0]?.value.xp.levelActions).toEqual([
      { id: 'level-1', level: 1, actions: [] },
      expect.objectContaining({ level: 2, actions: [] }),
    ]);
  });

  it('persists generated ids for actions and embed fields back into the draft config', () => {
    const updateDraftConfig = vi.fn((updater) =>
      updater({
        xp: {
          defaultActions: [
            {
              type: 'sendDm',
              format: 'embed',
              embed: {
                description: 'Saved {{level}}',
                fields: [{ name: 'Level', value: '{{level}}', inline: true }],
              },
            },
          ],
          levelActions: [{ level: 5, actions: [{ type: 'grantRole', roleId: 'role-1' }] }],
        },
      }),
    );

    render(
      <XpLevelActionsEditor
        draftConfig={{
          xp: {
            defaultActions: [
              {
                type: 'sendDm',
                format: 'embed',
                embed: {
                  description: 'Saved {{level}}',
                  fields: [{ name: 'Level', value: '{{level}}', inline: true }],
                },
              },
            ],
            levelActions: [{ level: 5, actions: [{ type: 'grantRole', roleId: 'role-1' }] }],
          },
        }}
        guildId="guild-1"
        saving={false}
        updateDraftConfig={updateDraftConfig}
      />,
    );

    expect(updateDraftConfig).toHaveBeenCalledTimes(1);
    expect(updateDraftConfig.mock.results[0]?.value.xp.defaultActions[0]).toMatchObject({
      id: expect.any(String),
      embed: {
        fields: [expect.objectContaining({ id: expect.any(String), name: 'Level' })],
      },
    });
    expect(updateDraftConfig.mock.results[0]?.value.xp.levelActions[0]).toMatchObject({
      id: expect.any(String),
      actions: [expect.objectContaining({ id: expect.any(String), roleId: 'role-1' })],
    });
  });
});
