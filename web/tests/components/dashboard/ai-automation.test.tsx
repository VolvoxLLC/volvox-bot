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

function createDraftConfig(overrides: Record<string, unknown> = {}) {
  const config = {
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
        toxicity: ['flag'],
        spam: ['delete'],
        harassment: ['warn'],
        hateSpeech: ['timeout'],
        sexualContent: ['delete'],
        violence: ['ban'],
        selfHarm: ['flag'],
      },
      flagChannelId: null,
      autoDelete: true,
    },
    triage: {
      enabled: true,
      classifyModel: 'minimax:MiniMax-M2.7',
      respondModel: 'minimax:MiniMax-M2.7',
    },
    memory: { enabled: true },
  };

  return {
    ...config,
    ...overrides,
    aiAutoMod: {
      ...config.aiAutoMod,
      ...((overrides.aiAutoMod as Record<string, unknown> | undefined) ?? {}),
    },
    triage: {
      ...config.triage,
      ...((overrides.triage as Record<string, unknown> | undefined) ?? {}),
    },
  };
}

function mockConfigContext({
  activeTabId = 'ai-automod',
  draftConfig = createDraftConfig(),
  updateDraftConfig = vi.fn((updater) => updater(draftConfig)),
}: {
  activeTabId?: string;
  draftConfig?: ReturnType<typeof createDraftConfig>;
  updateDraftConfig?: ReturnType<typeof vi.fn>;
} = {}) {
  mockUseConfigContext.mockReturnValue({
    draftConfig,
    saving: false,
    guildId: 'guild-1',
    activeTabId,
    updateDraftConfig,
  });

  return updateDraftConfig;
}

function mockAiAutoModContext(
  updateDraftConfig = vi.fn((updater) => updater(createDraftConfig())),
  draftConfig = createDraftConfig(),
) {
  return mockConfigContext({ updateDraftConfig, draftConfig });
}

describe('AiAutomationCategory', () => {
  it('renders a model selector and expanded sensitivity matrix for AI auto-moderation', () => {
    mockAiAutoModContext();

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Detection Model')).toHaveValue('minimax:MiniMax-M2.7');
    expect(screen.getByLabelText('Hate Speech Threshold')).toHaveValue(80);
    expect(screen.getByLabelText('Violence Permanent Ban')).toBeChecked();
    expect(screen.getByLabelText('Self-Harm Flag & Log')).toBeChecked();
    expect(screen.getByLabelText('Self-Harm Issue Warning')).not.toBeChecked();
    expect(screen.getAllByText('Toxicity')).toHaveLength(1);
    expect(screen.getAllByText('Spam')).toHaveLength(1);
    expect(screen.getAllByText('Harassment')).toHaveLength(1);
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

  it('lets each violation keep multiple response actions', () => {
    const updateDraftConfig = mockAiAutoModContext();

    render(<AiAutomationCategory />);

    fireEvent.click(screen.getByLabelText('Toxicity Issue Warning'));

    expect(updateDraftConfig).toHaveBeenCalledTimes(1);
    expect(updateDraftConfig.mock.results[0]?.value.aiAutoMod.actions.toxicity).toEqual([
      'flag',
      'warn',
    ]);
  });

  it('does not add unsupported saved models to the detection model dropdown', () => {
    const unsupportedModel = 'anthropic:claude-3-5-haiku';
    mockAiAutoModContext(vi.fn(), createDraftConfig({ aiAutoMod: { model: unsupportedModel } }));

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Detection Model')).toHaveValue('minimax:MiniMax-M2.7');
    expect(screen.queryByText(`Custom: ${unsupportedModel}`)).not.toBeInTheDocument();
  });

  it('renders supported model dropdowns in triage engine setup', () => {
    mockConfigContext({
      activeTabId: 'triage',
      draftConfig: createDraftConfig({
        triage: {
          classifyModel: 'moonshot:kimi-k2.6',
          respondModel: 'openrouter:minimax/minimax-m2.5',
        },
      }),
    });

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Classifier Engine').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Response Engine').tagName).toBe('SELECT');
    expect(screen.getByLabelText('Classifier Engine')).toHaveValue('moonshot:kimi-k2.6');
    expect(screen.getByLabelText('Response Engine')).toHaveValue(
      'openrouter:minimax/minimax-m2.5',
    );
    expect(screen.getAllByRole('option', { name: 'MiniMax M2.7' })).toHaveLength(2);
    expect(screen.queryByPlaceholderText('e.g. gpt-4o-mini')).not.toBeInTheDocument();
  });

  it('updates triage classifier and response models in draft config', () => {
    const updateDraftConfig = mockConfigContext({ activeTabId: 'triage' });

    render(<AiAutomationCategory />);

    fireEvent.change(screen.getByLabelText('Classifier Engine'), {
      target: { value: 'moonshot:kimi-k2.6' },
    });
    fireEvent.change(screen.getByLabelText('Response Engine'), {
      target: { value: 'moonshot:kimi-k2.5' },
    });

    expect(updateDraftConfig).toHaveBeenCalledTimes(2);
    expect(updateDraftConfig.mock.results[0]?.value.triage.classifyModel).toBe(
      'moonshot:kimi-k2.6',
    );
    expect(updateDraftConfig.mock.results[1]?.value.triage.respondModel).toBe('moonshot:kimi-k2.5');
  });

  it('does not add unsupported saved models to triage model dropdowns', () => {
    const unsupportedModel = 'anthropic:claude-3-5-haiku';
    mockConfigContext({
      activeTabId: 'triage',
      draftConfig: createDraftConfig({
        triage: { classifyModel: unsupportedModel, respondModel: unsupportedModel },
      }),
    });

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Classifier Engine')).toHaveValue('minimax:MiniMax-M2.7');
    expect(screen.getByLabelText('Response Engine')).toHaveValue('minimax:MiniMax-M2.7');
    expect(screen.queryByText(`Custom: ${unsupportedModel}`)).not.toBeInTheDocument();
  });
});
