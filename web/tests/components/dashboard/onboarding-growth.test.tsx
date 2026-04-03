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

vi.mock('@/components/dashboard/toggle-switch', () => ({
  ToggleSwitch: ({ label }: { label: string }) => <button type="button">{label}</button>,
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
  DiscordMarkdownEditor: ({ placeholder }: { placeholder?: string }) => (
    <div data-testid="discord-markdown-editor" data-placeholder={placeholder} />
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
      updateDraftConfig: vi.fn(),
    });

    render(<OnboardingGrowthCategory />);

    expect(screen.getByTestId('discord-markdown-editor')).toHaveAttribute(
      'data-placeholder',
      'Welcome {{user}} to {{server}}!',
    );
  });
});
