/**
 * Tests for config-editor section components and save/revert behavior.
 *
 * Covers:
 * - ConfigEditor loads config without triggering save (no PATCH on mount)
 * - Validation error detection for system prompt length
 * - Section-level revert functionality
 * - Normalization utilities
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

let mockPathname = '/dashboard/settings/ai-automation';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

// ── Mocks ─────────────────────────────────────────────────────────

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
    <button onClick={onReset} disabled={disabled} data-testid="discard-button">
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
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/components/ui/channel-selector', () => ({
  ChannelSelector: () => <div data-testid="channel-selector" />,
}));

vi.mock('@/components/ui/role-selector', () => ({
  RoleSelector: () => <div data-testid="role-selector" />,
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

// ── Fixtures ──────────────────────────────────────────────────────

const minimalConfig = {
  ai: { enabled: false, systemPrompt: '', blockedChannelIds: [] },
  welcome: { enabled: false, message: '' },
  moderation: { enabled: false },
  triage: { enabled: false },
  starboard: { enabled: false },
  permissions: { enabled: false },
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
  tldr: { enabled: false },
  afk: { enabled: false },
};

// ── Tests ─────────────────────────────────────────────────────────

describe('ConfigEditor integration', () => {
  beforeEach(() => {
    mockPathname = '/dashboard/settings/ai-automation';
    localStorage.clear();
    localStorage.setItem('volvox-bot-selected-guild', 'guild-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it(
    'loads config without issuing any PATCH request',
    async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigEditor } = await import('@/components/dashboard/config-editor');
    render(<ConfigEditor />);

    await waitFor(
      () => {
        expect(screen.getAllByText('AI Chat').length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    // Only GET should have been called — no PATCH
    const patchCalls = fetchMock.mock.calls.filter(
      (call: unknown[]) => (call[1] as { method?: string } | undefined)?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(0);
    },
    30_000,
  );

  it(
    'renders AI settings on the AI category route',
    async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigEditor } = await import('@/components/dashboard/config-editor');
    render(<ConfigEditor />);

    await waitFor(
      () => {
        expect(screen.getAllByText('AI Chat').length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

    expect(screen.getAllByText('AI Chat').length).toBeGreaterThan(0);
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getAllByText('Save Changes').length).toBeGreaterThan(0);
    },
    30_000,
  );

  it(
    'renders onboarding settings on the onboarding category route',
    async () => {
      mockPathname = '/dashboard/settings/onboarding-growth';

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigEditor } = await import('@/components/dashboard/config-editor');
    render(<ConfigEditor />);

    await waitFor(
      () => {
        expect(screen.getAllByText('Welcome Messages').length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );

      expect(screen.getAllByText('Welcome Messages').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Save Changes').length).toBeGreaterThan(0);
    },
    30_000,
  );

  it('renders with initial disabled discard button', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigEditor } = await import('@/components/dashboard/config-editor');
    render(<ConfigEditor />);

    await waitFor(
      () => {
        expect(screen.getByTestId('discard-button')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // Initially discard button should be disabled (no changes yet)
    const discardButton = screen.getByTestId('discard-button');
    expect(discardButton).toBeDisabled();
  });

  it('saves the edited system prompt via PATCH', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalConfig),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ...minimalConfig.ai,
          systemPrompt: 'Updated prompt',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          ...minimalConfig,
          ai: { ...minimalConfig.ai, systemPrompt: 'Updated prompt' },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigEditor } = await import('@/components/dashboard/config-editor');
    render(<ConfigEditor />);

    await waitFor(() => expect(screen.getByTestId('system-prompt')).toBeInTheDocument());

    const prompt = screen.getByTestId('system-prompt') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(prompt, { target: { value: 'Updated prompt' } });
    });

    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    await act(async () => {
      saveButton.click();
    });

    const confirmButton = await screen.findByRole('button', { name: 'Confirm Save' });
    await act(async () => {
      confirmButton.click();
    });

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (call: unknown[]) =>
          call[0] === '/api/guilds/guild-123/config' &&
          (call[1] as { method?: string } | undefined)?.method === 'PATCH',
      );

      expect(patchCall).toBeDefined();
      expect(patchCall?.[1]).toEqual(
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: 'ai.systemPrompt', value: 'Updated prompt' }),
        }),
      );
    });
  });

  it('discard restores the last saved config', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        ...minimalConfig,
        ai: { ...minimalConfig.ai, systemPrompt: 'Saved prompt' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigEditor } = await import('@/components/dashboard/config-editor');
    render(<ConfigEditor />);

    await waitFor(() => expect(screen.getByTestId('system-prompt')).toBeInTheDocument());

    const prompt = screen.getByTestId('system-prompt') as HTMLTextAreaElement;
    await act(async () => {
      fireEvent.change(prompt, { target: { value: 'Edited prompt' } });
    });

    const discardButton = screen.getByTestId('discard-button');
    await act(async () => {
      discardButton.click();
    });

    expect(screen.getByTestId('system-prompt')).toHaveValue('Saved prompt');
  });
});

// ── Unit tests for normalization utilities ────────────────────────

describe('config-normalization', () => {
  it('parseNumberInput handles valid numbers', async () => {
    const { parseNumberInput } = await import('@/lib/config-normalization');
    expect(parseNumberInput('42')).toBe(42);
    expect(parseNumberInput('3.14')).toBe(3.14);
    expect(parseNumberInput('0')).toBe(0);
  });

  it('parseNumberInput returns undefined for empty string', async () => {
    const { parseNumberInput } = await import('@/lib/config-normalization');
    expect(parseNumberInput('')).toBeUndefined();
  });

  it('parseNumberInput clamps to min/max bounds', async () => {
    const { parseNumberInput } = await import('@/lib/config-normalization');
    expect(parseNumberInput('5', 10)).toBe(10);
    expect(parseNumberInput('100', 0, 50)).toBe(50);
    expect(parseNumberInput('25', 10, 50)).toBe(25);
  });

  it('percentToDecimal converts correctly', async () => {
    const { percentToDecimal } = await import('@/lib/config-normalization');
    expect(percentToDecimal(100)).toBe(1);
    expect(percentToDecimal(50)).toBe(0.5);
    expect(percentToDecimal(0)).toBe(0);
    expect(percentToDecimal(150)).toBe(1); // clamped
    expect(percentToDecimal(-50)).toBe(0); // clamped
  });

  it('decimalToPercent converts correctly', async () => {
    const { decimalToPercent } = await import('@/lib/config-normalization');
    expect(decimalToPercent(1)).toBe(100);
    expect(decimalToPercent(0.5)).toBe(50);
    expect(decimalToPercent(0)).toBe(0);
    expect(decimalToPercent(0.333)).toBe(33);
  });
});

// ── Unit tests for config update utilities ────────────────────────

describe('config-updates', () => {
  const baseConfig = {
    ai: { enabled: false, systemPrompt: '' },
    welcome: { enabled: false, message: '' },
  };

  it('updateSectionEnabled toggles section enabled state', async () => {
    const { updateSectionEnabled } = await import('@/lib/config-updates');
    const source = { ...baseConfig, ai: { ...baseConfig.ai } };
    const result = updateSectionEnabled(source, 'ai', true);
    expect(result.ai?.enabled).toBe(true);
    expect(result.welcome?.enabled).toBe(false);
    // Source must not be mutated
    expect(source.ai?.enabled).toBe(false);
  });

  it('updateSectionField updates specific field', async () => {
    const { updateSectionField } = await import('@/lib/config-updates');
    const source = { ...baseConfig, ai: { ...baseConfig.ai } };
    const result = updateSectionField(source, 'ai', 'systemPrompt', 'Hello');
    expect(result.ai?.systemPrompt).toBe('Hello');
    expect(result.ai?.enabled).toBe(false);
    // Source must not be mutated
    expect(source.ai?.systemPrompt).toBe('');
  });

  it('updateNestedField updates nested object fields', async () => {
    const { updateNestedField } = await import('@/lib/config-updates');
    const configWithNested = {
      ...baseConfig,
      moderation: {
        enabled: false,
        rateLimit: { enabled: false, maxMessages: 10 },
      },
    };
    const result = updateNestedField(configWithNested, 'moderation', 'rateLimit', 'maxMessages', 20);
    expect((result.moderation as { rateLimit?: { maxMessages?: number } })?.rateLimit?.maxMessages).toBe(20);
    // Source must not be mutated
    expect((configWithNested.moderation as { rateLimit?: { maxMessages?: number } }).rateLimit?.maxMessages).toBe(10);
  });
});
