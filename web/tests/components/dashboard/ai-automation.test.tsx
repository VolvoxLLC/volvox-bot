import { render, screen, waitFor } from '@testing-library/react';
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
  ConfigCategoryLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/ui/channel-selector', () => ({
  ChannelSelector: ({ id }: { id?: string }) => <div data-testid={id ?? 'channel-selector'} />,
}));

vi.mock('@/components/ui/role-selector', () => ({
  RoleSelector: ({ id }: { id?: string }) => <div data-testid={id ?? 'role-selector'} />,
}));

vi.mock('@/components/dashboard/system-prompt-editor', () => ({
  SystemPromptEditor: () => <textarea data-testid="system-prompt" />,
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

function createContext(overrides: Partial<GuildConfig['triage']> = {}) {
  const updateDraftConfig = vi.fn();
  mockUseConfigContext.mockReturnValue({
    draftConfig: {
      triage: {
        enabled: true,
        classifyModel: visibleModelOption.value,
        respondModel: visibleModelOption.value,
        ...overrides,
      },
    },
    saving: false,
    guildId: 'guild-1',
    activeTabId: 'triage',
    updateDraftConfig,
  });
  return updateDraftConfig;
}

describe('AiAutomationCategory model selectors', () => {
  it('renders triage models as visible-only dropdown options', () => {
    createContext();

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
    const updateDraftConfig = createContext({ classifyModel: 'minimax:MiniMax-M2.5' });

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
});
