import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLogStream } from '@/lib/log-ws';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  message(payload: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) }));
  }

  rawMessage(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  serverClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close'));
  }
}

function mockTicketFetch(wsUrl = 'wss://bot.example/ws/logs', ticket = 'ticket') {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ wsUrl, ticket }),
  } as Response);
}

function expectSocketSent(ws: MockWebSocket, payload: unknown) {
  expect(ws.sent).toContain(JSON.stringify(payload));
}

async function flushMicrotasks(times = 2) {
  for (let index = 0; index < times; index += 1) {
    await Promise.resolve();
  }
}

async function renderLogStream(options: Parameters<typeof useLogStream>[0] = { guildId: 'guild-1' }) {
  const hook = renderHook(() => useLogStream(options));
  await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
  return { ...hook, ws: MockWebSocket.instances[0]! };
}

describe('useLogStream', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('fetches an HMAC ticket, opens the returned websocket URL, authenticates, and applies the guild filter', async () => {
    const fetchSpy = mockTicketFetch('wss://bot.example/ws/logs', 'signed-ticket');

    const { result } = await renderLogStream({ guildId: 'guild 1' });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/log-stream/ws-ticket?guildId=guild+1',
      expect.objectContaining({ cache: 'no-store' }),
    );

    const ws = MockWebSocket.instances[0]!;
    expect(ws.url).toBe('wss://bot.example/ws/logs');

    act(() => ws.open());
    expectSocketSent(ws, { type: 'auth', ticket: 'signed-ticket' });

    act(() => ws.message({ type: 'auth_ok' }));
    await waitFor(() => expect(result.current.status).toBe('connected'));
    expectSocketSent(ws, { type: 'filter', guildId: 'guild 1' });
  });

  it('normalizes history and live log payloads while ignoring malformed frames', async () => {
    mockTicketFetch();

    const { result, ws } = await renderLogStream();

    act(() => {
      ws.open();
      ws.message({ type: 'auth_ok' });
      ws.rawMessage('not json');
      ws.message({ type: 'history', logs: [null, { timestamp: '2026-04-28T00:00:00.000Z', level: 'WARN', message: 'warned', module: 'mod', metadata: { requestId: 'req-1' }, extra: true }] });
      ws.message({ type: 'log', level: 'bad', message: { structured: true }, metadata: ['ignored'], traceId: 'trace-1' });
    });

    await waitFor(() => expect(result.current.logs).toHaveLength(2));
    expect(result.current.logs[0]).toEqual(
      expect.objectContaining({
        timestamp: '2026-04-28T00:00:00.000Z',
        level: 'warn',
        message: 'warned',
        module: 'mod',
        meta: { requestId: 'req-1', extra: true },
      }),
    );
    expect(result.current.logs[1]).toEqual(
      expect.objectContaining({
        level: 'info',
        message: '{"structured":true}',
        meta: { traceId: 'trace-1' },
      }),
    );
  });

  it('sends updated filters over an open socket and preserves them after reconnect auth', async () => {
    mockTicketFetch();

    const { result, ws } = await renderLogStream();

    act(() => {
      ws.open();
      ws.message({ type: 'auth_ok' });
      result.current.sendFilter({ level: 'error', channelIds: ['chan-1'], search: 'panic' });
    });

    expectSocketSent(ws, {
      type: 'filter',
      level: 'error',
      channelIds: ['chan-1'],
      search: 'panic',
      guildId: 'guild-1',
    });
  });

  it('retries ticket failures with exponential backoff', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ wsUrl: 'wss://bot.example/ws/logs', ticket: 'retry-ticket' }) } as Response);

    const { result } = renderHook(() => useLogStream({ guildId: 'guild-1' }));

    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('reconnecting');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]?.url).toBe('wss://bot.example/ws/logs');
  });

  it('marks the stream disconnected and skips network work when disabled', () => {
    const fetchSpy = vi.spyOn(global, 'fetch');

    const { result } = renderHook(() => useLogStream({ enabled: false, guildId: 'guild-1' }));

    expect(result.current.status).toBe('disconnected');
    expect(result.current.logs).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clears logs on demand', async () => {
    mockTicketFetch();

    const { result } = await renderLogStream();

    act(() => {
      MockWebSocket.instances[0]!.message({ type: 'history', logs: [{ level: 'info', message: 'hello' }] });
    });
    await waitFor(() => expect(result.current.logs).toHaveLength(1));

    act(() => result.current.clearLogs());

    expect(result.current.logs).toEqual([]);
  });

  it('handles missing tickets, socket close reconnects, closed filters, and cleanup', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ wsUrl: '', ticket: '' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ wsUrl: 'wss://bot.example/ws/logs', ticket: 'ticket-1' }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ wsUrl: 'wss://bot.example/ws/logs', ticket: 'ticket-2' }) } as Response);

    const { result, unmount } = renderHook(() => useLogStream({ guildId: 'guild-1' }));

    await act(async () => {
      await flushMicrotasks();
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('reconnecting');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(MockWebSocket.instances).toHaveLength(1);
    const first = MockWebSocket.instances[0]!;

    act(() => {
      result.current.sendFilter({ module: 'api', level: 'all' });
      first.open();
      first.message({ type: 'auth_ok' });
      first.message({ type: 'history', logs: 'not-array' });
      first.message({ type: 'log' });
      first.message({ type: 'log', level: 'ERROR', message: 'boom', metadata: { requestId: 'r1' } });
      first.message({ type: 'unknown' });
    });

    expect(result.current.status).toBe('connected');
    expectSocketSent(first, { type: 'filter', module: 'api', level: 'all', guildId: 'guild-1' });
    expect(result.current.logs.at(-1)).toEqual(expect.objectContaining({ level: 'error', message: 'boom' }));

    act(() => first.serverClose());
    expect(result.current.status).toBe('reconnecting');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
    const second = MockWebSocket.instances[1]!;
    act(() => {
      second.open();
      second.message({ type: 'auth_ok' });
    });
    expectSocketSent(second, { type: 'filter', module: 'api', level: 'all', guildId: 'guild-1' });

    unmount();
    expect(second.readyState).toBe(MockWebSocket.CLOSED);
  });
});
