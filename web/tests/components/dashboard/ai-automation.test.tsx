import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuildConfig } from '@/components/dashboard/config-editor-utils';

const { visibleModelOptions } = vi.hoisted(() => ({
  visibleModelOptions: [
    {
      value: 'minimax:MiniMax-M2.7',
      label: 'MiniMax M2.7',
      providerName: 'minimax',
      providerDisplayName: 'MiniMax',
      modelName: 'MiniMax-M2.7',
      modelDisplayName: 'MiniMax M2.7',
    },
    {
      value: 'moonshot:kimi-k2.6',
      label: 'Kimi K2.6',
      providerName: 'moonshot',
      providerDisplayName: 'Moonshot',
      modelName: 'kimi-k2.6',
      modelDisplayName: 'Kimi K2.6',
    },
    {
      value: 'moonshot:kimi-k2.5',
      label: 'Kimi K2.5',
      providerName: 'moonshot',
      providerDisplayName: 'Moonshot',
      modelName: 'kimi-k2.5',
      modelDisplayName: 'Kimi K2.5',
    },
    {
      value: 'openrouter:minimax/minimax-m2.5',
      label: 'MiniMax M2.5 (via OpenRouter)',
      providerName: 'openrouter',
      providerDisplayName: 'OpenRouter',
      modelName: 'minimax/minimax-m2.5',
      modelDisplayName: 'MiniMax M2.5 (via OpenRouter)',
    },
  ],
}));

const mockUseConfigContext = vi.fn();

vi.mock('@/components/ui/select', () => import('../../helpers/mock-select'));

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
  RoleSelector: ({ id }: { id?: string }) => <div data-testid={id ?? 'role-selector'} />,
}));

vi.mock('@/components/dashboard/config-sections/ChannelModeSection', () => ({
  ChannelModeSection: () => <div data-testid="channel-mode-section" />,
}));

vi.mock('@/lib/provider-model-options', () => ({
  DEFAULT_AI_MODEL: 'minimax:MiniMax-M2.7',
  VISIBLE_PROVIDER_MODEL_OPTION_GROUPS: [
    {
      providerName: 'minimax',
      providerDisplayName: 'MiniMax',
      options: [visibleModelOptions[0]],
    },
    {
      providerName: 'moonshot',
      providerDisplayName: 'Moonshot',
      options: [visibleModelOptions[1], visibleModelOptions[2]],
    },
    {
      providerName: 'openrouter',
      providerDisplayName: 'OpenRouter',
      options: [visibleModelOptions[3]],
    },
  ],
  VISIBLE_PROVIDER_MODEL_OPTIONS: visibleModelOptions,
  getVisibleProviderModelValue: (value: string | null | undefined) => {
    if (typeof value === 'string' && value) {
      const match = visibleModelOptions.find(
        (option) => option.value.toLowerCase() === value.toLowerCase(),
      );
      if (match) return match.value;
      if (/^[a-z0-9][a-z0-9._-]*:[^\s:][^\s]*$/i.test(value) && value === value.trim()) {
        return value;
      }
    }
    return visibleModelOptions[0].value;
  },
}));

import { AiAutomationCategory } from '@/components/dashboard/config-categories/ai-automation';

function createDraftConfig(overrides: GuildConfig = {}): GuildConfig {
  const config: GuildConfig = {
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
      ...(overrides.aiAutoMod ?? {}),
    },
    triage: {
      ...config.triage,
      ...(overrides.triage ?? {}),
    },
  };
}

function mockConfigContext({
  activeTabId = 'ai-automod',
  draftConfig = createDraftConfig(),
  updateDraftConfig = vi.fn((updater) => updater(draftConfig)),
}: {
  activeTabId?: string;
  draftConfig?: GuildConfig;
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

  it('preserves legacy none AI auto-moderation actions as an empty action set', () => {
    const draftConfig = createDraftConfig({
      aiAutoMod: {
        actions: {
          toxicity: 'none',
        } as unknown as NonNullable<GuildConfig['aiAutoMod']>['actions'],
      },
    });
    const updateDraftConfig = vi.fn();
    mockAiAutoModContext(updateDraftConfig, draftConfig);

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Toxicity Flag & Log')).not.toBeChecked();
    expect(screen.getByLabelText('Toxicity Issue Warning')).not.toBeChecked();
    expect(screen.getByText('No response actions')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Toxicity Issue Warning'));

    const updater = updateDraftConfig.mock.calls[0]?.[0] as (config: GuildConfig) => GuildConfig;
    const nextConfig = updater(draftConfig);

    expect(nextConfig.aiAutoMod?.actions?.toxicity).toEqual(['warn']);
  });

  it('queues threshold edits against the latest AI auto-moderation state', () => {
    const updateDraftConfig = vi.fn();
    mockAiAutoModContext(updateDraftConfig);

    render(<AiAutomationCategory />);

    fireEvent.change(screen.getByLabelText('Toxicity Threshold'), {
      target: { value: '55' },
    });
    fireEvent.change(screen.getByLabelText('Spam Threshold'), {
      target: { value: '65' },
    });

    const baseConfig = createDraftConfig();
    const firstUpdater = updateDraftConfig.mock.calls[0]?.[0] as (
      config: GuildConfig,
    ) => GuildConfig;
    const secondUpdater = updateDraftConfig.mock.calls[1]?.[0] as (
      config: GuildConfig,
    ) => GuildConfig;

    const nextConfig = secondUpdater(firstUpdater(baseConfig));

    expect(nextConfig.aiAutoMod?.thresholds?.toxicity).toBe(0.55);
    expect(nextConfig.aiAutoMod?.thresholds?.spam).toBe(0.65);
  });

  it('queues response action edits against the latest AI auto-moderation state', () => {
    const updateDraftConfig = vi.fn();
    mockAiAutoModContext(updateDraftConfig);

    render(<AiAutomationCategory />);

    fireEvent.click(screen.getByLabelText('Toxicity Issue Warning'));
    fireEvent.click(screen.getByLabelText('Spam Flag & Log'));

    const baseConfig = createDraftConfig();
    const firstUpdater = updateDraftConfig.mock.calls[0]?.[0] as (
      config: GuildConfig,
    ) => GuildConfig;
    const secondUpdater = updateDraftConfig.mock.calls[1]?.[0] as (
      config: GuildConfig,
    ) => GuildConfig;

    const nextConfig = secondUpdater(firstUpdater(baseConfig));

    expect(nextConfig.aiAutoMod?.actions?.toxicity).toEqual(['flag', 'warn']);
    expect(nextConfig.aiAutoMod?.actions?.spam).toEqual(['flag', 'delete']);
  });

  it('preserves unknown saved models in the detection model dropdown', () => {
    const unsupportedModel = 'anthropic:claude-3-5-haiku';
    const updateDraftConfig = vi.fn();
    mockAiAutoModContext(
      updateDraftConfig,
      createDraftConfig({ aiAutoMod: { model: unsupportedModel } }),
    );

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Detection Model')).toHaveValue(unsupportedModel);
    expect(
      screen.getByRole('option', { name: `Current saved model: ${unsupportedModel}` }),
    ).toHaveAttribute('value', unsupportedModel);
    expect(updateDraftConfig).not.toHaveBeenCalled();
  });

  it('normalizes case-variant saved AI auto-moderation models before saving', async () => {
    const updateDraftConfig = vi.fn();
    mockAiAutoModContext(
      updateDraftConfig,
      createDraftConfig({ aiAutoMod: { model: 'MINIMAX:minimax-m2.7' } }),
    );

    render(<AiAutomationCategory />);

    await waitFor(() => {
      expect(updateDraftConfig).toHaveBeenCalled();
    });

    const updater = updateDraftConfig.mock.calls[0]?.[0] as (config: GuildConfig) => GuildConfig;
    const nextConfig = updater(
      createDraftConfig({ aiAutoMod: { model: 'MINIMAX:minimax-m2.7' } }),
    );

    expect(nextConfig.aiAutoMod?.model).toBe('minimax:MiniMax-M2.7');
  });

  it('repairs empty-string saved AI auto-moderation models before saving', async () => {
    const updateDraftConfig = vi.fn();
    mockAiAutoModContext(updateDraftConfig, createDraftConfig({ aiAutoMod: { model: '' } }));

    render(<AiAutomationCategory />);

    await waitFor(() => {
      expect(updateDraftConfig).toHaveBeenCalled();
    });

    const updater = updateDraftConfig.mock.calls[0]?.[0] as (config: GuildConfig) => GuildConfig;
    const nextConfig = updater(createDraftConfig({ aiAutoMod: { model: '' } }));

    expect(nextConfig.aiAutoMod?.model).toBe('minimax:MiniMax-M2.7');
  });

  it('does not persist a default AI auto-moderation model when the saved field is absent', () => {
    const updateDraftConfig = vi.fn();
    mockAiAutoModContext(updateDraftConfig, createDraftConfig({ aiAutoMod: { model: undefined } }));

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Detection Model')).toHaveValue('minimax:MiniMax-M2.7');
    expect(updateDraftConfig).not.toHaveBeenCalled();
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

  it('preserves hidden and unknown saved triage models', () => {
    const updateDraftConfig = vi.fn();
    mockConfigContext({
      activeTabId: 'triage',
      draftConfig: createDraftConfig({
        triage: {
          classifyModel: 'minimax:MiniMax-M2.5',
          respondModel: 'anthropic:claude-3-5-haiku',
        },
      }),
      updateDraftConfig,
    });

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Classifier Engine')).toHaveValue('minimax:MiniMax-M2.5');
    expect(screen.getByLabelText('Response Engine')).toHaveValue('anthropic:claude-3-5-haiku');
    expect(updateDraftConfig).not.toHaveBeenCalled();
  });

  it('does not persist default triage models when saved fields are absent', () => {
    const updateDraftConfig = vi.fn();
    mockConfigContext({
      activeTabId: 'triage',
      draftConfig: createDraftConfig({
        triage: { classifyModel: undefined, respondModel: undefined },
      }),
      updateDraftConfig,
    });

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Classifier Engine')).toHaveValue('minimax:MiniMax-M2.7');
    expect(screen.getByLabelText('Response Engine')).toHaveValue('minimax:MiniMax-M2.7');
    expect(updateDraftConfig).not.toHaveBeenCalled();
  });

  it('normalizes only case-variant saved triage model fields', async () => {
    const updateDraftConfig = vi.fn();
    mockConfigContext({
      activeTabId: 'triage',
      draftConfig: createDraftConfig({
        triage: { classifyModel: 'MINIMAX:minimax-m2.7', respondModel: undefined },
      }),
      updateDraftConfig,
    });

    render(<AiAutomationCategory />);

    await waitFor(() => {
      expect(updateDraftConfig).toHaveBeenCalled();
    });

    const updater = updateDraftConfig.mock.calls[0]?.[0] as (config: GuildConfig) => GuildConfig;
    const nextConfig = updater({
      triage: {
        enabled: true,
        classifyModel: 'MINIMAX:minimax-m2.7',
        respondModel: undefined,
      },
    });

    expect(nextConfig.triage?.classifyModel).toBe('minimax:MiniMax-M2.7');
    expect(nextConfig.triage?.respondModel).toBeUndefined();
  });

  it('repairs empty-string saved triage model fields before saving', async () => {
    const updateDraftConfig = vi.fn();
    mockConfigContext({
      activeTabId: 'triage',
      draftConfig: createDraftConfig({
        triage: { classifyModel: '', respondModel: '' },
      }),
      updateDraftConfig,
    });

    render(<AiAutomationCategory />);

    await waitFor(() => {
      expect(updateDraftConfig).toHaveBeenCalled();
    });

    const updater = updateDraftConfig.mock.calls[0]?.[0] as (config: GuildConfig) => GuildConfig;
    const nextConfig = updater({
      triage: {
        enabled: true,
        classifyModel: '',
        respondModel: '',
      },
    });

    expect(nextConfig.triage?.classifyModel).toBe('minimax:MiniMax-M2.7');
    expect(nextConfig.triage?.respondModel).toBe('minimax:MiniMax-M2.7');
  });

  it('shows unsupported saved models as current triage selections', () => {
    const unsupportedModel = 'anthropic:claude-3-5-haiku';
    mockConfigContext({
      activeTabId: 'triage',
      draftConfig: createDraftConfig({
        triage: { classifyModel: unsupportedModel, respondModel: unsupportedModel },
      }),
      updateDraftConfig: vi.fn(),
    });

    render(<AiAutomationCategory />);

    expect(screen.getByLabelText('Classifier Engine')).toHaveValue(unsupportedModel);
    expect(screen.getByLabelText('Response Engine')).toHaveValue(unsupportedModel);
    expect(
      screen.getAllByRole('option', { name: `Current saved model: ${unsupportedModel}` }),
    ).toHaveLength(2);
  });
});
