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
  });

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
