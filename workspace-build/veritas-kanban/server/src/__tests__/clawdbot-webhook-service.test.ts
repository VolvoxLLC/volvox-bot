/**
 * Clawdbot Webhook Service Tests
 *
 * Tests payload formatting, HMAC signing, delivery logic, and retry behaviour.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  signPayload,
  setWebhookUrl,
  getWebhookUrl,
  deliverWebhook,
  notifyTaskChange,
  notifyChatMessage,
  type WebhookTaskPayload,
  type WebhookChatPayload,
} from '../services/clawdbot-webhook-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Capture calls to global fetch. */
function mockFetch(response: { ok: boolean; status?: number } = { ok: true, status: 200 }) {
  const fn = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClawdbotWebhookService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear env overrides
    delete process.env.VERITAS_WEBHOOK_URL;
    delete process.env.VERITAS_WEBHOOK_SECRET;
    setWebhookUrl(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  describe('getWebhookUrl()', () => {
    it('returns undefined when nothing is configured', () => {
      expect(getWebhookUrl()).toBeUndefined();
    });

    it('returns settings-based URL when set', () => {
      setWebhookUrl('https://example.com/hook');
      expect(getWebhookUrl()).toBe('https://example.com/hook');
    });

    it('env var takes precedence over settings', () => {
      setWebhookUrl('https://settings.example.com/hook');
      process.env.VERITAS_WEBHOOK_URL = 'https://env.example.com/hook';
      expect(getWebhookUrl()).toBe('https://env.example.com/hook');
    });
  });

  // -------------------------------------------------------------------------
  // Signing
  // -------------------------------------------------------------------------

  describe('signPayload()', () => {
    it('produces a valid HMAC-SHA256 hex digest', () => {
      const sig = signPayload('{"test":true}', 'secret123');
      expect(sig).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces deterministic output', () => {
      const a = signPayload('hello', 'key');
      const b = signPayload('hello', 'key');
      expect(a).toBe(b);
    });

    it('differs for different secrets', () => {
      const a = signPayload('hello', 'key1');
      const b = signPayload('hello', 'key2');
      expect(a).not.toBe(b);
    });
  });

  // -------------------------------------------------------------------------
  // Delivery
  // -------------------------------------------------------------------------

  describe('deliverWebhook()', () => {
    const samplePayload: WebhookTaskPayload = {
      event: 'task:created',
      taskId: 'task_123',
      taskTitle: 'Test task',
      timestamp: '2025-01-01T00:00:00.000Z',
    };

    it('does nothing when no webhook URL is configured', async () => {
      const fetchSpy = mockFetch();
      await deliverWebhook(samplePayload);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('POSTs JSON to the configured URL', async () => {
      setWebhookUrl('https://hook.test/endpoint');
      const fetchSpy = mockFetch();

      await deliverWebhook(samplePayload);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, opts] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://hook.test/endpoint');
      expect(opts.method).toBe('POST');
      expect(opts.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(opts.body);
      expect(body.event).toBe('task:created');
      expect(body.taskId).toBe('task_123');
    });

    it('includes X-Webhook-Signature when secret is set', async () => {
      setWebhookUrl('https://hook.test/endpoint');
      process.env.VERITAS_WEBHOOK_SECRET = 'my-secret';
      const fetchSpy = mockFetch();

      await deliverWebhook(samplePayload);

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers['X-Webhook-Signature']).toMatch(/^[0-9a-f]{64}$/);
    });

    it('does NOT include X-Webhook-Signature when no secret', async () => {
      setWebhookUrl('https://hook.test/endpoint');
      const fetchSpy = mockFetch();

      await deliverWebhook(samplePayload);

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers['X-Webhook-Signature']).toBeUndefined();
    });

    it('retries once after 2 s on failure', async () => {
      setWebhookUrl('https://hook.test/endpoint');
      const fetchSpy = mockFetch({ ok: false, status: 500 });

      await deliverWebhook(samplePayload);

      // First call already happened
      expect(fetchSpy).toHaveBeenCalledOnce();

      // Advance timers to trigger the retry
      await vi.advanceTimersByTimeAsync(2_000);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('retries once on fetch error (network failure)', async () => {
      setWebhookUrl('https://hook.test/endpoint');
      const fetchSpy = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      vi.stubGlobal('fetch', fetchSpy);

      await deliverWebhook(samplePayload);

      expect(fetchSpy).toHaveBeenCalledOnce();

      // Advance timers to trigger the retry
      await vi.advanceTimersByTimeAsync(2_000);

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry on success', async () => {
      setWebhookUrl('https://hook.test/endpoint');
      const fetchSpy = mockFetch({ ok: true });

      await deliverWebhook(samplePayload);

      expect(fetchSpy).toHaveBeenCalledOnce();

      // Advance timers — no retry should fire
      await vi.advanceTimersByTimeAsync(5_000);

      expect(fetchSpy).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Payload formatting helpers
  // -------------------------------------------------------------------------

  describe('notifyTaskChange()', () => {
    it('formats a task payload and calls deliverWebhook', async () => {
      setWebhookUrl('https://hook.test/endpoint');
      const fetchSpy = mockFetch();

      notifyTaskChange('created', 'task_abc', {
        title: 'My Task',
        status: 'in-progress',
        previousStatus: 'todo',
        assignee: 'agent',
        project: 'proj_1',
      });

      // Allow the promise to resolve
      await vi.advanceTimersByTimeAsync(0);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body).toMatchObject({
        event: 'task:created',
        taskId: 'task_abc',
        taskTitle: 'My Task',
        status: 'in-progress',
        previousStatus: 'todo',
        assignee: 'agent',
        project: 'proj_1',
      });
      expect(body.timestamp).toBeDefined();
    });

    it('works without optional context', async () => {
      setWebhookUrl('https://hook.test/endpoint');
      const fetchSpy = mockFetch();

      notifyTaskChange('deleted', 'task_xyz');

      await vi.advanceTimersByTimeAsync(0);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.event).toBe('task:deleted');
      expect(body.taskId).toBe('task_xyz');
    });
  });

  describe('notifyChatMessage()', () => {
    it('formats a chat payload and calls deliverWebhook', async () => {
      setWebhookUrl('https://hook.test/endpoint');
      const fetchSpy = mockFetch();

      notifyChatMessage('session_1', 'chat:message', 'Hello world');

      await vi.advanceTimersByTimeAsync(0);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const body: WebhookChatPayload = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body).toMatchObject({
        event: 'chat:message',
        chatSessionId: 'session_1',
        message: 'Hello world',
      });
      expect(body.timestamp).toBeDefined();
    });
  });
});
