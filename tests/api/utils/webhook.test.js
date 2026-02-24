import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/api/utils/validateWebhookUrl.js', () => ({
  validateWebhookUrl: vi.fn().mockReturnValue(true),
}));

import { validateWebhookUrl } from '../../../src/api/utils/validateWebhookUrl.js';
import { fireAndForgetWebhook, WEBHOOK_TIMEOUT_MS } from '../../../src/api/utils/webhook.js';
import { warn } from '../../../src/logger.js';

/** Flush the microtask queue far enough to let .then().catch().finally() chains settle. */
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('fireAndForgetWebhook', () => {
  beforeEach(() => {
    vi.stubEnv('TEST_WEBHOOK_URL', 'https://example.com/hook');
    validateWebhookUrl.mockReturnValue(true);
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

  it('should return early when validateWebhookUrl returns false', async () => {
    validateWebhookUrl.mockReturnValueOnce(false);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    fireAndForgetWebhook('TEST_WEBHOOK_URL', { event: 'test' });
    await flushPromises();
    expect(fetchSpy).not.toHaveBeenCalled();
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

  it('should abort fetch after WEBHOOK_TIMEOUT_MS', () => {
    vi.useFakeTimers();
    let capturedSignal;
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, opts) => {
      capturedSignal = opts.signal;
      return new Promise(() => {}); // never resolves
    });

    fireAndForgetWebhook('TEST_WEBHOOK_URL', { event: 'test' });

    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    expect(capturedSignal.aborted).toBe(false);

    vi.advanceTimersByTime(WEBHOOK_TIMEOUT_MS);

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

  it('should log a warning when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

    fireAndForgetWebhook('TEST_WEBHOOK_URL', { event: 'test' });
    await flushPromises();

    expect(warn).toHaveBeenCalledWith(
      'TEST_WEBHOOK_URL webhook failed',
      expect.objectContaining({ error: 'network error', url: 'https://example.com/hook' }),
    );
  });
});
