import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
  Toaster: () => null,
}));

vi.mock('@/components/dashboard/reset-defaults-button', () => ({
  DiscardChangesButton: ({
    onReset,
    disabled,
  }: {
    onReset: () => void;
    disabled: boolean;
  }) => (
    <button onClick={onReset} disabled={disabled}>
      Discard
    </button>
  ),
}));

vi.mock('@/components/dashboard/system-prompt-editor', () => ({
  SystemPromptEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <textarea
      data-testid="system-prompt"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/components/ui/channel-selector', () => ({
  ChannelSelector: ({ id }: { id?: string }) => (
    <div data-testid="channel-selector" id={id}>
      channel-selector
    </div>
  ),
}));

vi.mock('@/components/ui/role-selector', () => ({
  RoleSelector: ({ id }: { id?: string }) => (
    <div data-testid="role-selector" id={id}>
      role-selector
    </div>
  ),
}));

vi.mock('@/components/dashboard/config-diff', () => ({
  ConfigDiff: () => <div data-testid="config-diff" />,
}));

vi.mock('@/components/dashboard/config-diff-modal', () => ({
  ConfigDiffModal: ({
    open,
    onConfirm,
  }: {
    open: boolean;
    onConfirm: () => void;
  }) =>
    open ? (
      <div data-testid="config-diff-modal">
        <button type="button" onClick={onConfirm}>
          Confirm Save
        </button>
      </div>
    ) : null,
}));

let mockPathname = '/dashboard/settings/ai-automation';

const minimalConfig = {
  ai: { enabled: false, systemPrompt: '', blockedChannelIds: [] },
  aiAutoMod: {
    enabled: false,
    thresholds: { toxicity: 0.7, spam: 0.7, harassment: 0.7 },
    actions: { toxicity: 'flag', spam: 'flag', harassment: 'flag' },
    flagChannelId: null,
    autoDelete: true,
  },
  welcome: {
    enabled: false,
    message: '',
    roleMenu: { enabled: false, options: [] },
    dmSequence: { enabled: false, steps: [] },
  },
  moderation: {
    enabled: false,
    dmNotifications: { warn: false, timeout: false, kick: false, ban: false },
    escalation: { enabled: false },
  },
  triage: { enabled: false },
  starboard: { enabled: false },
  permissions: { enabled: false, botOwners: [] },
  memory: { enabled: false },
  reputation: { enabled: false },
  xp: {
    enabled: false,
    levelThresholds: [100, 300, 600],
    levelActions: [],
    defaultActions: [],
    levelUpDm: {
      enabled: false,
      sendOnEveryLevel: false,
      defaultMessage: '🎉 You reached **Level {{level}}** in **{{server}}**! Keep chatting!',
      messages: [],
    },
    roleRewards: { stackRoles: true, removeOnLevelDown: false },
  },
  engagement: { enabled: false },
  challenges: { enabled: false },
  github: { feed: { enabled: false } },
  tickets: { enabled: false },
  help: { enabled: false },
  announce: { enabled: false },
  snippet: { enabled: false },
  poll: { enabled: false },
  showcase: { enabled: false },
  review: { enabled: false },
  tldr: { enabled: false, defaultMessages: 25, maxMessages: 100, cooldownSeconds: 30 },
  afk: { enabled: false },
};

const minimalConfigWithoutLevelUpDm = {
  ...minimalConfig,
  xp: {
    enabled: false,
    levelThresholds: [100, 300, 600],
    levelActions: [],
    defaultActions: [],
    roleRewards: { stackRoles: true, removeOnLevelDown: false },
  },
};

describe('ConfigEditor workspace integration (new architecture)', () => {
  beforeEach(() => {
    mockPathname = '/dashboard/settings/ai-automation';
    mockPush.mockClear();
    localStorage.clear();
    localStorage.setItem('volvox-bot-selected-guild', 'guild-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders category navigation and AI features', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigLayoutShell } = await import('@/components/dashboard/config-layout-shell');
    const { AiAutomationCategory } = await import(
      '@/components/dashboard/config-categories/ai-automation'
    );

    render(
      <ConfigLayoutShell>
        <AiAutomationCategory />
      </ConfigLayoutShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /AI & Automation/i })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'AI Chat' })).toBeInTheDocument();
  }, 15000);

  it('renders onboarding features when on the onboarding route', async () => {
    mockPathname = '/dashboard/settings/onboarding-growth';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigLayoutShell } = await import('@/components/dashboard/config-layout-shell');
    const { OnboardingGrowthCategory } = await import(
      '@/components/dashboard/config-categories/onboarding-growth'
    );

    render(
      <ConfigLayoutShell>
        <OnboardingGrowthCategory />
      </ConfigLayoutShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Welcome Messages' })).toBeInTheDocument();
    });

    expect(screen.getByRole('heading', { name: 'Reputation / XP' })).toBeInTheDocument();
  });

  it('filters visible feature cards by search query', async () => {
    mockPathname = '/dashboard/settings/onboarding-growth';
    const user = userEvent.setup();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigLayoutShell } = await import('@/components/dashboard/config-layout-shell');
    const { OnboardingGrowthCategory } = await import(
      '@/components/dashboard/config-categories/onboarding-growth'
    );

    render(
      <ConfigLayoutShell>
        <OnboardingGrowthCategory />
      </ConfigLayoutShell>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Search settings')).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Search settings'), 'reputation');

    expect(screen.getByRole('heading', { name: 'Reputation / XP' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome Messages' })).not.toBeInTheDocument();
  });

  it('finds level-up DM settings via search query', async () => {
    mockPathname = '/dashboard/settings/onboarding-growth';
    const user = userEvent.setup();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigLayoutShell } = await import('@/components/dashboard/config-layout-shell');
    const { OnboardingGrowthCategory } = await import(
      '@/components/dashboard/config-categories/onboarding-growth'
    );

    render(
      <ConfigLayoutShell>
        <OnboardingGrowthCategory />
      </ConfigLayoutShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Level-Up Actions' })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText('Search settings'), 'levelup');

    expect(screen.getByRole('heading', { name: 'Level-Up Actions' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Welcome Messages' })).not.toBeInTheDocument();
  }, 15000);

  it('edits level-up DM settings from the level-up actions card', async () => {
    mockPathname = '/dashboard/settings/onboarding-growth';
    const user = userEvent.setup();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigLayoutShell } = await import('@/components/dashboard/config-layout-shell');
    const { OnboardingGrowthCategory } = await import(
      '@/components/dashboard/config-categories/onboarding-growth'
    );

    render(
      <ConfigLayoutShell>
        <OnboardingGrowthCategory />
      </ConfigLayoutShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Level-Up Actions' })).toBeInTheDocument();
    });

    const levelUpCard = screen
      .getByRole('heading', { name: 'Level-Up Actions' })
      .closest('.feature-card');
    expect(levelUpCard).not.toBeNull();

    const advancedButton = levelUpCard?.querySelector('button[aria-expanded]');
    expect(advancedButton).not.toBeNull();
    await user.click(advancedButton as HTMLButtonElement);

    await user.click(screen.getByLabelText('Toggle level-up DMs'));
    expect(screen.getByLabelText('Toggle send on every level')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Default DM Template'));
    await user.type(screen.getByLabelText('Default DM Template'), 'Nice work {{username}}');

    await user.click(screen.getByRole('button', { name: 'Add Override' }));
    await user.click(screen.getByRole('button', { name: 'Add Override' }));

    const levelInputs = screen.getAllByRole('spinbutton', { name: 'Level' });
    expect(levelInputs).toHaveLength(2);
    expect(levelInputs[0]).toHaveValue(1);
    expect(levelInputs[1]).toHaveValue(2);

    const getOverrideTextareas = () =>
      Array.from(levelUpCard?.querySelectorAll('textarea') ?? []).filter(
        (element) => element.getAttribute('id') !== 'xp-level-dm-default',
      );

    expect(getOverrideTextareas()).toHaveLength(2);

    const firstOverrideTextarea = getOverrideTextareas()[0] as HTMLTextAreaElement;
    await user.click(firstOverrideTextarea);
    await user.clear(firstOverrideTextarea);
    await user.type(firstOverrideTextarea, 'Override text');

    await act(async () => {
      await Promise.resolve();
    });

    const refreshedFirstOverrideTextarea = getOverrideTextareas()[0] as HTMLTextAreaElement;

    expect(refreshedFirstOverrideTextarea).toBe(firstOverrideTextarea);
    expect(document.activeElement).toBe(refreshedFirstOverrideTextarea);
    expect(refreshedFirstOverrideTextarea).toHaveValue('Override text');
    expect(screen.getAllByText('Override Preview').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Override text/).length).toBeGreaterThan(0);

    fireEvent.change(levelInputs[1], { target: { value: '10' } });
    const secondOverrideTextarea = getOverrideTextareas()[1] as HTMLTextAreaElement;
    fireEvent.change(secondOverrideTextarea, { target: { value: 'Level {{level}}' } });
    const secondOverrideCard = secondOverrideTextarea.closest('.space-y-3');
    expect(secondOverrideCard).not.toBeNull();

    await waitFor(() => {
      expect(levelInputs[1]).toHaveValue(10);
      const previewParagraph = secondOverrideCard?.querySelector('p.whitespace-pre-wrap');
      expect(previewParagraph?.textContent).toContain('Level 10');
    });
  }, 15000);

  it('saves level-up DM fields as dotted patches when levelUpDm is newly added', async () => {
    mockPathname = '/dashboard/settings/onboarding-growth';
    const user = userEvent.setup();

    const fetchMock = vi.fn().mockImplementation(
      (_url: string, options?: { method?: string; body?: string }) => {
        if (options?.method === 'PATCH') {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(minimalConfigWithoutLevelUpDm),
        });
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigLayoutShell } = await import('@/components/dashboard/config-layout-shell');
    const { OnboardingGrowthCategory } = await import(
      '@/components/dashboard/config-categories/onboarding-growth'
    );

    render(
      <ConfigLayoutShell>
        <OnboardingGrowthCategory />
      </ConfigLayoutShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Level-Up Actions' })).toBeInTheDocument();
    });

    const levelUpCard = screen
      .getByRole('heading', { name: 'Level-Up Actions' })
      .closest('.feature-card');
    const advancedButton = levelUpCard?.querySelector('button[aria-expanded]');
    await user.click(advancedButton as HTMLButtonElement);

    await user.click(screen.getByLabelText('Toggle level-up DMs'));
    await user.clear(screen.getByLabelText('Default DM Template'));
    await user.type(screen.getByLabelText('Default DM Template'), 'Level {{level}}');
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));
    await user.click(screen.getByRole('button', { name: /Confirm Save/i }));

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (call: unknown[]) => (call[1] as { method?: string } | undefined)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });

    const patchBodies = fetchMock.mock.calls
      .filter((call: unknown[]) => (call[1] as { method?: string } | undefined)?.method === 'PATCH')
      .map((call: unknown[]) => JSON.parse(((call[1] as { body?: string }).body ?? '{}')));

    expect(patchBodies.some((body: { path?: string }) => body.path === 'xp')).toBe(false);
    expect(
      patchBodies.some(
        (body: { path?: string; value?: unknown }) =>
          body.path === 'xp.levelUpDm.enabled' && body.value === true,
      ),
    ).toBe(true);
  }, 15000);

  it('shows unsaved changes banner after edits', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigLayoutShell } = await import('@/components/dashboard/config-layout-shell');
    const { AiAutomationCategory } = await import(
      '@/components/dashboard/config-categories/ai-automation'
    );

    render(
      <ConfigLayoutShell>
        <AiAutomationCategory />
      </ConfigLayoutShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('system-prompt')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('system-prompt'), { target: { value: 'new prompt' } });
    });

    expect(screen.getByText(/unsaved changes in 1 category/i)).toBeInTheDocument();
  });

  it('requires diff confirmation before PATCH and sends PATCH after confirm', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation((_url: string, options?: { method?: string }) => {
      if (options?.method === 'PATCH') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalConfig),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigLayoutShell } = await import('@/components/dashboard/config-layout-shell');
    const { AiAutomationCategory } = await import(
      '@/components/dashboard/config-categories/ai-automation'
    );

    render(
      <ConfigLayoutShell>
        <AiAutomationCategory />
      </ConfigLayoutShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('system-prompt')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('system-prompt'), {
        target: { value: 'updated prompt' },
      });
    });

    await user.click(screen.getByRole('button', { name: /Save Changes/i }));

    expect(screen.getByText('Review Changes Before Saving')).toBeInTheDocument();

    const patchCallsBeforeConfirm = fetchMock.mock.calls.filter(
      (call: unknown[]) => (call[1] as { method?: string } | undefined)?.method === 'PATCH',
    );
    expect(patchCallsBeforeConfirm).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /Confirm Save/i }));

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (call: unknown[]) => (call[1] as { method?: string } | undefined)?.method === 'PATCH',
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });
  });

  it('shows validation error banner and disables save on long system prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigLayoutShell } = await import('@/components/dashboard/config-layout-shell');
    const { AiAutomationCategory } = await import(
      '@/components/dashboard/config-categories/ai-automation'
    );

    render(
      <ConfigLayoutShell>
        <AiAutomationCategory />
      </ConfigLayoutShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('system-prompt')).toBeInTheDocument();
    });

    const tooLong = 'x'.repeat(4001);
    await act(async () => {
      fireEvent.change(screen.getByTestId('system-prompt'), { target: { value: tooLong } });
    });

    expect(screen.getByText(/Fix validation errors before changes can be saved/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeDisabled();
  });
});
