import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/api/utils/ssrfProtection.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    validateUrlForSsrf: vi.fn().mockResolvedValue({ valid: true }),
  };
});

import { validateUrlForSsrf } from '../../../src/api/utils/ssrfProtection.js';
import { info, warn } from '../../../src/logger.js';
import { handleWebhook, validateWebhookUrl } from '../../../src/modules/actions/webhook.js';

function makeContext() {
  return {
    member: { user: { id: 'user1' } },
    guild: { id: 'guild1' },
    templateContext: {
      level: '5',
      username: 'TestUser',
      xp: '1,000',
    },
  };
}

describe('validateWebhookUrl', () => {
  it('should accept valid HTTPS URLs', () => {
    const result = validateWebhookUrl('https://example.com/webhook');
    expect(result.valid).toBe(true);
  });

  it('should accept valid HTTP URLs', () => {
    const result = validateWebhookUrl('http://example.com/webhook');
    expect(result.valid).toBe(true);
  });

  it('should reject empty strings', () => {
    const result = validateWebhookUrl('');
    expect(result.valid).toBe(false);
  });

  it('should reject null/undefined', () => {
    expect(validateWebhookUrl(null).valid).toBe(false);
    expect(validateWebhookUrl(undefined).valid).toBe(false);
  });

  it('should reject non-HTTP protocols', () => {
    const result = validateWebhookUrl('ftp://example.com/file');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('HTTP or HTTPS');
  });

  it('should reject malformed URLs', () => {
    const result = validateWebhookUrl('not a url');
    expect(result.valid).toBe(false);
  });

  it('should reject localhost and private network URLs', () => {
    expect(validateWebhookUrl('https://localhost/hook').valid).toBe(false);
    expect(validateWebhookUrl('https://169.254.169.254/latest/meta-data/').valid).toBe(false);
    expect(validateWebhookUrl('https://192.168.1.10/hook').valid).toBe(false);
  });
});

describe('handleWebhook', () => {
  let originalFetch;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(validateUrlForSsrf).mockResolvedValue({ valid: true });
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should POST rendered payload to the URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    globalThis.fetch = mockFetch;

    const ctx = makeContext();
    await handleWebhook(
      {
        type: 'webhook',
        url: 'https://example.com/hook',
        payload: '{"user":"{{username}}","level":{{level}}}',
      },
      ctx,
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"user":"TestUser","level":5}',
        redirect: 'manual',
      }),
    );

    expect(info).toHaveBeenCalledWith('webhook fired', expect.objectContaining({ status: 200 }));
  });

  it('should skip when async SSRF validation fails', async () => {
    vi.mocked(validateUrlForSsrf).mockResolvedValue({
      valid: false,
      error: 'URL hostname resolves to blocked IP address 10.0.0.1',
      blockedIp: '10.0.0.1',
    });
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const ctx = makeContext();
    await handleWebhook({ type: 'webhook', url: 'https://example.com/hook', payload: '{}' }, ctx);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'webhook action failed SSRF validation â€” skipping',
      expect.objectContaining({
        blockedIp: '10.0.0.1',
        reason: 'URL hostname resolves to blocked IP address 10.0.0.1',
      }),
    );
  });

  it('should block redirects instead of following them', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 302 });
    globalThis.fetch = mockFetch;

    const ctx = makeContext();
    await handleWebhook({ type: 'webhook', url: 'https://example.com/hook', payload: '{}' }, ctx);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ redirect: 'manual' }),
    );
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'webhook redirect blocked',
      expect.objectContaining({ status: 302 }),
    );
  });

  it('should skip on invalid URL', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const ctx = makeContext();
    await handleWebhook({ type: 'webhook', url: 'not-a-url', payload: '{}' }, ctx);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'webhook action has invalid URL — skipping',
      expect.any(Object),
    );
  });

  it('should handle timeout (AbortError)', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    const mockFetch = vi.fn().mockRejectedValue(abortError);
    globalThis.fetch = mockFetch;

    const ctx = makeContext();
    await handleWebhook({ type: 'webhook', url: 'https://example.com/hook', payload: '{}' }, ctx);

    expect(warn).toHaveBeenCalledWith(
      'webhook timed out (5s)',
      expect.objectContaining({ url: 'https://example.com/hook' }),
    );
  });

  it('should handle network errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    globalThis.fetch = mockFetch;

    const ctx = makeContext();
    await handleWebhook({ type: 'webhook', url: 'https://example.com/hook', payload: '{}' }, ctx);

    expect(warn).toHaveBeenCalledWith(
      'webhook request failed',
      expect.objectContaining({ error: 'ECONNREFUSED' }),
    );
  });

  it('should use empty object as default payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    globalThis.fetch = mockFetch;

    const ctx = makeContext();
    await handleWebhook({ type: 'webhook', url: 'https://example.com/hook' }, ctx);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ body: '{}' }),
    );
  });
});
