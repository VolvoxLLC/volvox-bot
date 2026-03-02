/**
 * Tests for the auto-save feature in ConfigEditor.
 *
 * Covers:
 * - AutoSaveStatus component renders the correct UI for each state
 * - ConfigEditor loads config without triggering auto-save (no PATCH on mount)
 * - Validation error banner appears when system prompt exceeds max length
 * - Retry button is present in the error state
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

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

describe('ConfigEditor auto-save integration', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('volvox-bot-selected-guild', 'guild-123');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads config without issuing any PATCH request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(minimalConfig),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigEditor } = await import('@/components/dashboard/config-editor');
    render(<ConfigEditor />);

    // Wait for config to load
    await waitFor(
      () => {
        expect(screen.getByTestId('system-prompt')).toBeTruthy();
      },
      { timeout: 3000 },
    );

    // Only GET should have been called — no PATCH
    const patchCalls = fetchMock.mock.calls.filter(
      (call: unknown[]) => (call[1] as { method?: string } | undefined)?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(0);
  });

  it('shows validation error banner when system prompt exceeds max length', async () => {
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
        expect(screen.getByTestId('system-prompt')).toBeTruthy();
      },
      { timeout: 3000 },
    );

    // Type more than SYSTEM_PROMPT_MAX_LENGTH chars (20000)
    const tooLong = 'x'.repeat(20001);
    await act(async () => {
      fireEvent.change(screen.getByTestId('system-prompt'), { target: { value: tooLong } });
    });

    await waitFor(
      () => {
        expect(
          screen.getByText(/Fix validation errors before changes can be saved/),
        ).toBeTruthy();
      },
      { timeout: 3000 },
    );

    // No PATCH should have been issued
    const patchCalls = fetchMock.mock.calls.filter(
      (call: unknown[]) => (call[1] as { method?: string } | undefined)?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(0);
  });
});

// ── Unit tests for AutoSaveStatus (via snapshot-style checks) ─────

describe('auto-save status UI', () => {
  it('shows "Saving..." with a spinner while saving', async () => {
    // Render a minimal page that mimics a long-running save by keeping fetch pending
    const fetchMock = vi.fn().mockImplementation((_url: string, opts: { method?: string }) => {
      if (opts?.method === 'PATCH') {
        // Never resolves — keeps saving state visible
        return new Promise(() => {});
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(minimalConfig),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigEditor } = await import('@/components/dashboard/config-editor');
    render(<ConfigEditor />);

    await waitFor(() => expect(screen.getByTestId('system-prompt')).toBeTruthy(), {
      timeout: 3000,
    });

    // Trigger a change so auto-save will fire
    await act(async () => {
      fireEvent.change(screen.getByTestId('system-prompt'), { target: { value: 'Hello' } });
    });

    // Wait for the 500ms debounce — use real timers here
    await new Promise((resolve) => setTimeout(resolve, 600));

    await waitFor(() => expect(screen.getByText('Saving...')).toBeTruthy(), { timeout: 3000 });
  }, 10000);

  it('shows "Save failed" with a Retry button when PATCH returns an error', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(minimalConfig),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ConfigEditor } = await import('@/components/dashboard/config-editor');
    render(<ConfigEditor />);

    await waitFor(() => expect(screen.getByTestId('system-prompt')).toBeTruthy(), {
      timeout: 3000,
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('system-prompt'), {
        target: { value: 'Trigger save failure' },
      });
    });

    // Wait for debounce + save attempt
    await new Promise((resolve) => setTimeout(resolve, 700));

    await waitFor(() => expect(screen.getByText('Save failed')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeTruthy();
  }, 15000);
});
