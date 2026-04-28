import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockUseConfigContext = vi.fn();

vi.mock('@/components/dashboard/config-context', () => ({
  useConfigContext: () => mockUseConfigContext(),
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
            if (!toggle.disabled) toggle.onChange(!toggle.checked);
          }}
        >
          {toggle.label ?? 'Toggle current feature'}
        </button>
      )}
      {children}
    </>
  ),
}));

vi.mock('@/components/dashboard/system-prompt-editor', () => ({
  SystemPromptEditor: () => <textarea aria-label="system prompt" />,
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
        if (!disabled) onChange(!checked);
      }}
    >
      {label}
    </button>
  ),
}));

vi.mock('@/components/ui/channel-selector', () => ({
  ChannelSelector: ({ id }: { id?: string }) => (
    <div data-testid={id ? `channel-selector-${id}` : 'channel-selector'} />
  ),
}));

vi.mock('@/components/ui/role-selector', () => ({
  RoleSelector: () => <div data-testid="role-selector" />,
}));

vi.mock('@/components/dashboard/config-sections/ChannelModeSection', () => ({
  ChannelModeSection: () => <div data-testid="channel-mode-section" />,
}));

import { AiAutomationCategory } from '@/components/dashboard/config-categories/ai-automation';

function createDraftConfig() {
  return {
    ai: { enabled: true, systemPrompt: '', blockedChannelIds: [] },
    aiAutoMod: {
      enabled: true,
      model: 'minimax:MiniMax-M2.7',
      thresholds: {
        toxicity: 0.7,
        spam: 0.8,
        harassment: 0.7,
        hateSpeech: 0.8,
        sexualContent: 0.8,
        violence: 0.85,
        selfHarm: 0.7,
      },
      actions: {
        toxicity: 'flag',
        spam: 'delete',
        harassment: 'warn',
        hateSpeech: 'timeout',
        sexualContent: 'delete',
        violence: 'ban',
        selfHarm: 'flag',
      },
      flagChannelId: null,
      autoDelete: true,
    },
    triage: { enabled: true },
    memory: { enabled: true },
  };
}

function mockAiAutoModContext(updateDraftConfig = vi.fn((updater) => updater(createDraftConfig()))) {
  mockUseConfigContext.mockReturnValue({
    draftConfig: createDraftConfig(),
    saving: false,
    guildId: 'guild-1',
    activeTabId: 'ai-automod',
    updateDraftConfig,
  });

  return updateDraftConfig;
}

describe('AiAutomationCategory', () => {
  it('renders a model selector and expanded sensitivity matrix for AI auto-moderation', () => {
    mockAiAutoModContext();

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Detection Model')).toHaveValue('minimax:MiniMax-M2.7');
    expect(screen.getByLabelText('Hate Speech Threshold')).toHaveValue(80);
    expect(screen.getByLabelText('Violence Action')).toHaveValue('ban');
    expect(screen.getByLabelText('Self-Harm Action')).toHaveValue('flag');
  });

  it('updates the selected AI auto-moderation model in draft config', () => {
    const updateDraftConfig = mockAiAutoModContext();

    render(<AiAutomationCategory />);

    fireEvent.change(screen.getByLabelText('Detection Model'), {
      target: { value: 'moonshot:kimi-k2.6' },
    });

    expect(updateDraftConfig).toHaveBeenCalledTimes(1);
    expect(updateDraftConfig.mock.results[0]?.value.aiAutoMod.model).toBe('moonshot:kimi-k2.6');
  });
});
