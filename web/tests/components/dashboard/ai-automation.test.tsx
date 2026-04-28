import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuildConfig } from '@/components/dashboard/config-editor-utils';

const { visibleModelOption } = vi.hoisted(() => ({
  visibleModelOption: {
    value: 'minimax:MiniMax-M2.7',
    label: 'MiniMax M2.7',
    providerName: 'minimax',
    providerDisplayName: 'MiniMax',
    modelName: 'MiniMax-M2.7',
    modelDisplayName: 'MiniMax M2.7',
  },
}));

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
  SystemPromptEditor: () => <textarea aria-label="system prompt" data-testid="system-prompt" />,
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
  ChannelSelector: ({ id }: { id?: string }) => <div data-testid={id ?? 'channel-selector'} />,
}));

vi.mock('@/components/ui/role-selector', () => ({
  RoleSelector: ({ id }: { id?: string }) => <div data-testid={id ?? 'role-selector'} />,
}));

vi.mock('@/components/dashboard/config-sections/ChannelModeSection', () => ({
  ChannelModeSection: () => <div data-testid="channel-mode-section" />,
}));

vi.mock('@/lib/provider-model-options', () => ({
  VISIBLE_PROVIDER_MODEL_OPTION_GROUPS: [
    {
      providerName: 'minimax',
      providerDisplayName: 'MiniMax',
      options: [visibleModelOption],
    },
  ],
  VISIBLE_PROVIDER_MODEL_OPTIONS: [visibleModelOption],
  getVisibleProviderModelValue: (value: string | null | undefined) =>
    value === visibleModelOption.value ? value : visibleModelOption.value,
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
      classifyModel: visibleModelOption.value,
      respondModel: visibleModelOption.value,
    },
    memory: { enabled: true },
  };

  return {
    ...config,
    ...overrides,
    aiAutoMod: overrides.aiAutoMod ? { ...config.aiAutoMod, ...overrides.aiAutoMod } : config.aiAutoMod,
    triage: overrides.triage ? { ...config.triage, ...overrides.triage } : config.triage,
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

function mockAiAutoModContext(updateDraftConfig = vi.fn((updater) => updater(createDraftConfig()))) {
  return mockConfigContext({ updateDraftConfig });
}

function createTriageContext(overrides: Partial<GuildConfig['triage']> = {}) {
  const updateDraftConfig = vi.fn();
  return mockConfigContext({
    activeTabId: 'triage',
    draftConfig: createDraftConfig({
      triage: {
        enabled: true,
        classifyModel: visibleModelOption.value,
        respondModel: visibleModelOption.value,
        ...overrides,
      },
    }),
    updateDraftConfig,
  });
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

  it('renders triage models as visible-only dropdown options', () => {
    createTriageContext();

    render(<AiAutomationCategory />);

    const classifierSelect = screen.getByLabelText('Classifier Engine');
    const responseSelect = screen.getByLabelText('Response Engine');

    expect(classifierSelect.tagName).toBe('SELECT');
    expect(responseSelect.tagName).toBe('SELECT');
    expect(classifierSelect).toHaveValue(visibleModelOption.value);
    expect(responseSelect).toHaveValue(visibleModelOption.value);
    expect(screen.getAllByRole('option', { name: 'MiniMax M2.7' })).toHaveLength(2);
    expect(screen.queryByRole('option', { name: /MiniMax M2.5/ })).not.toBeInTheDocument();
  });

  it('normalizes hidden saved triage models to the first visible model', async () => {
    const updateDraftConfig = createTriageContext({ classifyModel: 'minimax:MiniMax-M2.5' });

    render(<AiAutomationCategory />);

    await waitFor(() => {
      expect(updateDraftConfig).toHaveBeenCalled();
    });

    const updater = updateDraftConfig.mock.calls[0]?.[0] as (config: GuildConfig) => GuildConfig;
    const nextConfig = updater({
      triage: {
        enabled: true,
        classifyModel: 'minimax:MiniMax-M2.5',
        respondModel: visibleModelOption.value,
      },
    } as GuildConfig);

    expect(nextConfig.triage?.classifyModel).toBe(visibleModelOption.value);
    expect(nextConfig.triage?.respondModel).toBe(visibleModelOption.value);
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
});
