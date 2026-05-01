import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockFlush, mockInit, mockTrack } = vi.hoisted(() => ({
  mockFlush: vi.fn(),
  mockInit: vi.fn(),
  mockTrack: vi.fn(),
}));

vi.mock('@amplitude/analytics-node', () => ({
  flush: mockFlush,
  init: mockInit,
  track: mockTrack,
  Types: {
    LogLevel: {
      None: 'none',
    },
    ServerZone: {
      EU: 'EU',
      US: 'US',
    },
  },
}));

describe('amplitude analytics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not initialize or track events without an API key', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', '');

    const { amplitudeEnabled, trackAnalyticsEvent } = await import('../src/amplitude.js');

    expect(amplitudeEnabled).toBe(false);
    expect(trackAnalyticsEvent('bot_log_recorded', { ok: true })).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('initializes Amplitude with EU residency when configured', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');
    vi.stubEnv('AMPLITUDE_SERVER_ZONE', 'EU');

    const { amplitudeEnabled } = await import('../src/amplitude.js');

    expect(amplitudeEnabled).toBe(true);
    expect(mockInit).toHaveBeenCalledWith('server-key', {
      logLevel: 'none',
      serverZone: 'EU',
    });
  });

  it('falls back to the US server zone for unknown values', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');
    vi.stubEnv('AMPLITUDE_SERVER_ZONE', 'moon');

    const { getAmplitudeServerOptions } = await import('../src/amplitude.js');

    expect(getAmplitudeServerOptions().serverZone).toBe('US');
  });

  it('tracks sanitized analytics events with safe identity options', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');

    const { trackAnalyticsEvent } = await import('../src/amplitude.js');

    expect(
      trackAnalyticsEvent(
        'Command Executed',
        {
          command: 'ban',
          token: 'secret',
          nested: {
            authorization: 'Bearer secret',
            ok: true,
          },
          rows: [{ apiKey: 'secret' }, { safe: 'value' }],
        },
        {
          device_id: 'device-12345',
          user_id: 'user-12345',
        },
      ),
    ).toBe(true);

    expect(mockTrack).toHaveBeenCalledWith(
      'Command Executed',
      {
        command: 'ban',
        nested: {
          ok: true,
        },
        rows: [{}, { safe: 'value' }],
      },
      {
        device_id: 'device-12345',
        user_id: 'user-12345',
      },
    );
  });

  it('drops blank event names and short Amplitude identifiers', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');

    const { trackAnalyticsEvent } = await import('../src/amplitude.js');

    expect(trackAnalyticsEvent('  ', { ok: true }, { user_id: '123' })).toBe(false);
    expect(trackAnalyticsEvent('bot_log_recorded', { ok: true }, { user_id: '123' })).toBe(true);

    expect(mockTrack).toHaveBeenCalledWith(
      'bot_log_recorded',
      { ok: true },
      { device_id: 'volvox-bot-server' },
    );
  });

  it('flushes queued analytics only when Amplitude is enabled', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');
    mockFlush.mockReturnValue({ promise: Promise.resolve() });

    const { flushAmplitude } = await import('../src/amplitude.js');

    await expect(flushAmplitude()).resolves.toBe(true);
    expect(mockFlush).toHaveBeenCalledOnce();
  });

  it('returns false from flushAmplitude when Amplitude is disabled', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', '');

    const { flushAmplitude } = await import('../src/amplitude.js');

    await expect(flushAmplitude()).resolves.toBe(false);
    expect(mockFlush).not.toHaveBeenCalled();
  });

  it('returns false from flushAmplitude when flush rejects', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');
    mockFlush.mockReturnValue({ promise: Promise.reject(new Error('network error')) });

    const { flushAmplitude } = await import('../src/amplitude.js');

    await expect(flushAmplitude()).resolves.toBe(false);
  });

  it('returns false from trackAnalyticsEvent when amplitude.track throws', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');
    mockTrack.mockImplementationOnce(() => {
      throw new Error('network unavailable');
    });

    const { trackAnalyticsEvent } = await import('../src/amplitude.js');

    expect(trackAnalyticsEvent('test_event', { ok: true })).toBe(false);
  });

  it('uses default device_id when user_id and device_id are both too short', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');

    const { trackAnalyticsEvent, DEFAULT_AMPLITUDE_DEVICE_ID } = await import(
      '../src/amplitude.js'
    );

    trackAnalyticsEvent('my_event', {}, { user_id: 'ab', device_id: 'xy' });

    expect(mockTrack).toHaveBeenCalledWith(
      'my_event',
      {},
      { device_id: DEFAULT_AMPLITUDE_DEVICE_ID },
    );
  });

  it('uses userId / deviceId aliases in eventOptions', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');

    const { trackAnalyticsEvent } = await import('../src/amplitude.js');

    trackAnalyticsEvent('alias_event', {}, { userId: 'user-99999', deviceId: 'device-99999' });

    expect(mockTrack).toHaveBeenCalledWith(
      'alias_event',
      {},
      { user_id: 'user-99999', device_id: 'device-99999' },
    );
  });
});

// ─── scrubAmplitudeProperties (unit tests) ────────────────────────────────────

describe('scrubAmplitudeProperties', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function getScrub() {
    const { scrubAmplitudeProperties } = await import('../src/amplitude.js');
    return scrubAmplitudeProperties;
  }

  it('returns primitive numbers and booleans as-is', async () => {
    const scrub = await getScrub();
    expect(scrub(42)).toBe(42);
    expect(scrub(true)).toBe(true);
    expect(scrub(null)).toBeNull();
    expect(scrub(undefined)).toBeUndefined();
  });

  it('redacts inline Bearer tokens in strings', async () => {
    const scrub = await getScrub();
    expect(scrub('Authorization: Bearer abc123xyz456')).toBe(
      'Authorization: [REDACTED]',
    );
  });

  it('redacts Anthropic/OpenAI sk- keys in strings', async () => {
    const scrub = await getScrub();
    expect(scrub('key=sk-abcdefghijk1234')).toBe('key=[REDACTED]');
  });

  it('converts Date objects to ISO strings', async () => {
    const scrub = await getScrub();
    const date = new Date('2026-01-15T10:00:00.000Z');
    expect(scrub(date)).toBe('2026-01-15T10:00:00.000Z');
  });

  it('converts Error objects to {name, message} with redacted message', async () => {
    const scrub = await getScrub();
    const err = new TypeError('Bearer secret123abc456def blew up');
    const result = scrub(err);
    expect(result).toMatchObject({ name: 'TypeError' });
    expect(result.message).toContain('[REDACTED]');
  });

  it('processes arrays recursively', async () => {
    const scrub = await getScrub();
    const result = scrub([{ token: 'secret', safe: 'keep' }, 42, 'plain']);
    expect(result).toEqual([{ safe: 'keep' }, 42, 'plain']);
  });

  it('removes keys matching the sensitive key pattern', async () => {
    const scrub = await getScrub();
    const result = scrub({
      authorization: 'Bearer secret',
      cookie: 'session=abc',
      secret: 'shh',
      password: 'hunter2',
      token: 'tok',
      apiKey: 'key123',
      safe: 'keep-this',
    });
    expect(result).toEqual({ safe: 'keep-this' });
  });

  it('handles circular references gracefully', async () => {
    const scrub = await getScrub();
    const obj = { name: 'root' };
    obj.self = obj;
    const result = scrub(obj);
    expect(result.name).toBe('root');
    expect(result.self).toBe('[Circular]');
  });

  it('handles deeply nested objects', async () => {
    const scrub = await getScrub();
    const result = scrub({ a: { b: { c: { password: 'secret', value: 42 } } } });
    expect(result).toEqual({ a: { b: { c: { value: 42 } } } });
  });

  it('redacts x-forwarded-for and ip_address keys', async () => {
    const scrub = await getScrub();
    const result = scrub({
      'x-forwarded-for': '1.2.3.4',
      ip_address: '127.0.0.1',
      ipAddress: '10.0.0.1',
      ok: true,
    });
    expect(result).toEqual({ ok: true });
  });
});
