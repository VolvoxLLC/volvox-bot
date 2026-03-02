import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { fireAndForgetWebhook, WEBHOOK_TIMEOUT_MS } from '../../../src/api/utils/webhook.js';
import { warn } from '../../../src/logger.js';

/**
 * Flush the microtask queue far enough to let .then().catch().finally() chains settle.
 */
const flushPromises = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('fireAndForgetWebhook', () => {
  beforeEach(() => {
    vi.stubEnv('TEST_WEBHOOK_URL', 'https://example.com/hook');
    // Prevent inherited CI runner env from breaking no-secret assertions
    vi.stubEnv('WEBHOOK_SECRET', undefined);
    vi.stubEnv('SESSION_SECRET', undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should return early when env var is not set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fireAndForgetWebhook('NONEXISTENT_ENV_VAR', { event: 'test' });
    await flushPromises();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return early and warn when URL is invalid', async () => {
    vi.stubEnv('TEST_WEBHOOK_URL', 'not-a-url');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fireAndForgetWebhook('TEST_WEBHOOK_URL', { event: 'test' });
    await flushPromises();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'TEST_WEBHOOK_URL webhook has invalid URL',
      expect.objectContaining({ url: '<invalid>' }),
    );
  });

  it('should POST correct payload on successful webhook', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
    const payload = { event: 'config.updated', timestamp: 12345 };

    fireAndForgetWebhook('TEST_WEBHOOK_URL', payload);
    await flushPromises();

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(opts.method).toBe('POST');
    expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(opts.body)).toEqual(payload);
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('should abort fetch after WEBHOOK_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    let capturedSignal;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opts) => {
      capturedSignal = opts.signal;
      return new Promise(() => {}); // never resolves
    });

    fireAndForgetWebhook('TEST_WEBHOOK_URL', { event: 'test' });

    // Flush microtasks so fetch gets called
    await vi.advanceTimersByTimeAsync(0);

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(WEBHOOK_TIMEOUT_MS);

    expect(capturedSignal.aborted).toBe(true);
  });

  it('should log a warning when webhook returns non-OK status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 });

    fireAndForgetWebhook('TEST_WEBHOOK_URL', { event: 'test' });
    await flushPromises();

    expect(warn).toHaveBeenCalledWith(
      'TEST_WEBHOOK_URL webhook returned non-OK status',
      expect.objectContaining({ status: 503, url: 'https://example.com/hook' }),
    );
  });

  it('should sanitize URL in warning logs (strip query/fragment)', async () => {
    vi.stubEnv('TEST_WEBHOOK_URL', 'https://example.com/hook?token=secret&key=abc#frag');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 });

    fireAndForgetWebhook('TEST_WEBHOOK_URL', { event: 'test' });
    await flushPromises();

    expect(warn).toHaveBeenCalledWith(
      'TEST_WEBHOOK_URL webhook returned non-OK status',
      expect.objectContaining({ status: 500, url: 'https://example.com/hook' }),
    );
  });

  it('should log a warning when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

    fireAndForgetWebhook('TEST_WEBHOOK_URL', { event: 'test' });
    await flushPromises();

    expect(warn).toHaveBeenCalledWith(
      'TEST_WEBHOOK_URL webhook failed',
      expect.objectContaining({ error: 'network error', url: 'https://example.com/hook' }),
    );
  });

  describe('HMAC signing', () => {
    // Belt-and-suspenders: explicitly ensure both secrets start unset for every test in this block,
    // on top of the outer beforeEach. Guards against real env vars leaking from CI runner.
    beforeEach(() => {
      vi.stubEnv('WEBHOOK_SECRET', undefined);
      vi.stubEnv('SESSION_SECRET', undefined);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should sign with WEBHOOK_SECRET when set', async () => {
      vi.stubEnv('WEBHOOK_SECRET', 'test-webhook-secret');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
      const payload = { event: 'config.updated' };
      const body = JSON.stringify(payload);

      fireAndForgetWebhook('TEST_WEBHOOK_URL', payload);
      await flushPromises();

      const [, opts] = fetchSpy.mock.calls[0];
      const expected = createHmac('sha256', 'test-webhook-secret').update(body).digest('hex');
      expect(opts.headers['X-Webhook-Signature']).toBe(expected);
    });

    it('should fall back to SESSION_SECRET when WEBHOOK_SECRET is not set', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-session-secret');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
      const payload = { event: 'config.updated' };
      const body = JSON.stringify(payload);

      fireAndForgetWebhook('TEST_WEBHOOK_URL', payload);
      await flushPromises();

      const [, opts] = fetchSpy.mock.calls[0];
      const expected = createHmac('sha256', 'test-session-secret').update(body).digest('hex');
      expect(opts.headers['X-Webhook-Signature']).toBe(expected);
    });

    it('should prefer WEBHOOK_SECRET over SESSION_SECRET when both are set', async () => {
      vi.stubEnv('WEBHOOK_SECRET', 'test-webhook-secret');
      vi.stubEnv('SESSION_SECRET', 'test-session-secret');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });
      const payload = { event: 'config.updated' };
      const body = JSON.stringify(payload);

      fireAndForgetWebhook('TEST_WEBHOOK_URL', payload);
      await flushPromises();

      const [, opts] = fetchSpy.mock.calls[0];
      const expected = createHmac('sha256', 'test-webhook-secret').update(body).digest('hex');
      expect(opts.headers['X-Webhook-Signature']).toBe(expected);
    });

    it('should omit X-Webhook-Signature when neither secret is set', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });

      fireAndForgetWebhook('TEST_WEBHOOK_URL', { event: 'test' });
      await flushPromises();

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers).not.toHaveProperty('X-Webhook-Signature');
    });

    it('should NOT fall back to SESSION_SECRET when WEBHOOK_SECRET is explicitly set to empty string', async () => {
      // Key behavior: "" is explicitly set, so we don't silently fall through to SESSION_SECRET.
      // The empty WEBHOOK_SECRET simply means "no signing" — no surprise key usage.
      vi.stubEnv('WEBHOOK_SECRET', '');
      vi.stubEnv('SESSION_SECRET', 'test-session-secret');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true });

      fireAndForgetWebhook('TEST_WEBHOOK_URL', { event: 'test' });
      await flushPromises();

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers).not.toHaveProperty('X-Webhook-Signature');
    });
  });
});
