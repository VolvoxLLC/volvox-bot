import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { handleWebhook, validateWebhookUrl } from '../../../src/modules/actions/webhook.js';
import { info, warn } from '../../../src/logger.js';

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
    expect(result.reason).toContain('Protocol');
  });

  it('should reject malformed URLs', () => {
    const result = validateWebhookUrl('not a url');
    expect(result.valid).toBe(false);
  });
});

describe('handleWebhook', () => {
  let originalFetch;

  beforeEach(() => {
    vi.clearAllMocks();
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
      }),
    );

    expect(info).toHaveBeenCalledWith(
      'webhook fired',
      expect.objectContaining({ status: 200 }),
    );
  });

  it('should skip on invalid URL', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch;

    const ctx = makeContext();
    await handleWebhook(
      { type: 'webhook', url: 'not-a-url', payload: '{}' },
      ctx,
    );

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
    await handleWebhook(
      { type: 'webhook', url: 'https://example.com/hook', payload: '{}' },
      ctx,
    );

    expect(warn).toHaveBeenCalledWith(
      'webhook timed out (5s)',
      expect.objectContaining({ url: 'https://example.com/hook' }),
    );
  });

  it('should handle network errors gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    globalThis.fetch = mockFetch;

    const ctx = makeContext();
    await handleWebhook(
      { type: 'webhook', url: 'https://example.com/hook', payload: '{}' },
      ctx,
    );

    expect(warn).toHaveBeenCalledWith(
      'webhook request failed',
      expect.objectContaining({ error: 'ECONNREFUSED' }),
    );
  });

  it('should use empty object as default payload', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ status: 200 });
    globalThis.fetch = mockFetch;

    const ctx = makeContext();
    await handleWebhook(
      { type: 'webhook', url: 'https://example.com/hook' },
      ctx,
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ body: '{}' }),
    );
  });
});
