import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockFlush, mockInit, mockTrack } = vi.hoisted(() => ({
  mockFlush: vi.fn(),
  mockInit: vi.fn(),
  mockTrack: vi.fn(),
}));

async function getScrub() {
  const { scrubAmplitudeProperties } = await import('../src/amplitude.js');
  return scrubAmplitudeProperties;
}

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

    const { isAmplitudeEnabled, trackAnalyticsEvent } = await import('../src/amplitude.js');

    expect(isAmplitudeEnabled()).toBe(false);
    expect(trackAnalyticsEvent('bot_log_recorded', { ok: true })).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('initializes Amplitude with EU residency on first track when configured', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');
    vi.stubEnv('AMPLITUDE_SERVER_ZONE', 'EU');

    const analytics = await import('../src/amplitude.js');

    expect(analytics.isAmplitudeEnabled()).toBe(true);
    expect(mockInit).not.toHaveBeenCalled();

    expect(analytics.trackAnalyticsEvent('bot_log_recorded', { ok: true })).toBe(true);

    expect(mockInit).toHaveBeenCalledWith('server-key', {
      logLevel: 'none',
      serverZone: 'EU',
    });
  });

  it('picks up an Amplitude API key added after module import', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', '');

    const analytics = await import('../src/amplitude.js');

    expect(analytics.isAmplitudeEnabled()).toBe(false);
    expect(analytics.trackAnalyticsEvent('bot_log_recorded', { before: true })).toBe(false);

    vi.stubEnv('AMPLITUDE_API_KEY', 'runtime-key');
    vi.stubEnv('AMPLITUDE_SERVER_ZONE', 'EU');

    expect(analytics.trackAnalyticsEvent('bot_log_recorded', { after: true })).toBe(true);
    expect(analytics.isAmplitudeEnabled()).toBe(true);
    expect(mockInit).toHaveBeenCalledWith('runtime-key', {
      logLevel: 'none',
      serverZone: 'EU',
    });
    expect(mockTrack).toHaveBeenCalledWith(
      'bot_log_recorded',
      { after: true },
      { device_id: 'volvox-bot-server' },
    );
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

  it('flushAmplitude checks the current environment at call time', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');

    const analytics = await import('../src/amplitude.js');

    expect(analytics.isAmplitudeEnabled()).toBe(true);

    vi.stubEnv('AMPLITUDE_API_KEY', '');

    await expect(analytics.flushAmplitude()).resolves.toBe(false);
    expect(analytics.isAmplitudeEnabled()).toBe(false);
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

  it('returns primitive numbers and booleans as-is', async () => {
    const scrub = await getScrub();
    expect(scrub(42)).toBe(42);
    expect(scrub(true)).toBe(true);
    expect(scrub(null)).toBeNull();
    expect(scrub(undefined)).toBeUndefined();
  });

  it('redacts inline Bearer tokens in strings', async () => {
    const scrub = await getScrub();
    expect(scrub('Authorization: Bearer abc123xyz456')).toBe('Authorization: [REDACTED]');
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

  it('preserves repeated non-cyclic references while marking true cycles', async () => {
    const scrub = await getScrub();
    const shared = { ok: true };
    const result = scrub({ first: shared, second: shared });

    expect(result).toEqual({
      first: { ok: true },
      second: { ok: true },
    });
  });

  it('handles cyclic arrays without marking later shared arrays circular', async () => {
    const scrub = await getScrub();
    const cyclic = ['root'];
    cyclic.push(cyclic);
    const shared = ['shared'];

    const result = scrub({ cyclic, first: shared, second: shared });

    expect(result).toEqual({
      cyclic: ['root', '[Circular]'],
      first: ['shared'],
      second: ['shared'],
    });
  });

  it('handles deeply nested objects', async () => {
    const scrub = await getScrub();
    const result = scrub({ a: { b: { c: { password: 'secret', value: 42 } } } });
    expect(result).toEqual({ a: { b: { c: { value: 42 } } } });
  });

  it('redacts x-forwarded-for and ip_address keys', async () => {
    const scrub = await getScrub();
    const result = scrub({
      'x-forwarded-for': 'client.example',
      ip_address: 'loopback.example',
      ipAddress: 'internal.example',
      ok: true,
    });
    expect(result).toEqual({ ok: true });
  });

  it('redacts email keys matching the sensitive key pattern', async () => {
    const scrub = await getScrub();
    const result = scrub({
      email: 'user@example.com',
      safeField: 'keep-this',
    });
    expect(result).toEqual({ safeField: 'keep-this' });
  });

  it('redacts GitHub and Slack xox tokens in strings', async () => {
    const scrub = await getScrub();
    expect(scrub('token: ghp_abc1234567890abcdef')).toBe('token: [REDACTED]');
    expect(scrub('token: xoxb_1234567890_abcdefghijk')).toBe('token: [REDACTED]');
    expect(scrub('key: ghs_abcdefghijklmnop12345678')).toBe('key: [REDACTED]');
  });

  it('handles empty string without errors', async () => {
    const scrub = await getScrub();
    expect(scrub('')).toBe('');
  });

  it('handles empty object without errors', async () => {
    const scrub = await getScrub();
    expect(scrub({})).toEqual({});
  });

  it('handles empty array without errors', async () => {
    const scrub = await getScrub();
    expect(scrub([])).toEqual([]);
  });

  it('removes dashed e-mail keys', async () => {
    const scrub = await getScrub();
    const result = scrub({
      'e-mail': 'person@example.com',
      nested: { 'e-mail': 'nested@example.com', ok: true },
      ok: true,
    });

    expect(result).toEqual({ nested: { ok: true }, ok: true });
  });
});

// ─── Additional amplitude analytics edge-case tests ───────────────────────────

describe('amplitude analytics — additional edge cases', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('falls back to US server zone when AMPLITUDE_SERVER_ZONE is not set at all', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');
    delete process.env.AMPLITUDE_SERVER_ZONE;

    const { getAmplitudeServerOptions } = await import('../src/amplitude.js');
    expect(getAmplitudeServerOptions().serverZone).toBe('US');
  });

  it('uses the EU server zone for lowercase eu input', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');
    vi.stubEnv('AMPLITUDE_SERVER_ZONE', 'eu');

    const { getAmplitudeServerOptions } = await import('../src/amplitude.js');
    expect(getAmplitudeServerOptions().serverZone).toBe('EU');
  });

  it('falls back to US server zone for empty AMPLITUDE_SERVER_ZONE string', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');
    vi.stubEnv('AMPLITUDE_SERVER_ZONE', '');

    const { getAmplitudeServerOptions } = await import('../src/amplitude.js');
    expect(getAmplitudeServerOptions().serverZone).toBe('US');
  });

  it('accepts userId alias in trackAnalyticsEvent', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');

    const { trackAnalyticsEvent } = await import('../src/amplitude.js');

    trackAnalyticsEvent('test_event', {}, { userId: 'user-abcde' });

    expect(mockTrack).toHaveBeenCalledWith(
      'test_event',
      {},
      expect.objectContaining({ user_id: 'user-abcde' }),
    );
  });

  it('uses default device_id when userId is exactly 4 chars (too short)', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');

    const { trackAnalyticsEvent, DEFAULT_AMPLITUDE_DEVICE_ID } = await import(
      '../src/amplitude.js'
    );

    trackAnalyticsEvent('test_event', {}, { userId: 'abcd' });

    expect(mockTrack).toHaveBeenCalledWith(
      'test_event',
      {},
      { device_id: DEFAULT_AMPLITUDE_DEVICE_ID },
    );
  });

  it('accepts userId exactly 5 chars (minimum length)', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');

    const { trackAnalyticsEvent } = await import('../src/amplitude.js');

    trackAnalyticsEvent('test_event', {}, { userId: 'abcde' });

    expect(mockTrack).toHaveBeenCalledWith(
      'test_event',
      {},
      expect.objectContaining({ user_id: 'abcde' }),
    );
  });

  it('does not include user_id in options when userId is invalid', async () => {
    vi.stubEnv('AMPLITUDE_API_KEY', 'server-key');

    const { trackAnalyticsEvent, DEFAULT_AMPLITUDE_DEVICE_ID } = await import(
      '../src/amplitude.js'
    );

    trackAnalyticsEvent('test_event', {}, { userId: null });

    const [, , options] = mockTrack.mock.calls[0];
    expect(options.user_id).toBeUndefined();
    expect(options.device_id).toBe(DEFAULT_AMPLITUDE_DEVICE_ID);
  });

  it('AMPLITUDE_LOG_EVENT constant has expected value', async () => {
    const { AMPLITUDE_LOG_EVENT } = await import('../src/amplitude.js');
    expect(AMPLITUDE_LOG_EVENT).toBe('bot_log_recorded');
  });

  it('DEFAULT_AMPLITUDE_DEVICE_ID constant has expected value', async () => {
    const { DEFAULT_AMPLITUDE_DEVICE_ID } = await import('../src/amplitude.js');
    expect(DEFAULT_AMPLITUDE_DEVICE_ID).toBe('volvox-bot-server');
  });
});
