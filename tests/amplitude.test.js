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
});
