import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockInit, mockReset, mockSetUserId, mockTrack } = vi.hoisted(() => ({
  mockInit: vi.fn(),
  mockReset: vi.fn(),
  mockSetUserId: vi.fn(),
  mockTrack: vi.fn(),
}));

vi.mock('@amplitude/analytics-browser', () => ({
  init: mockInit,
  reset: mockReset,
  setUserId: mockSetUserId,
  track: mockTrack,
  Types: {
    LogLevel: {
      None: 'none',
    },
  },
}));

describe('dashboard Amplitude analytics', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not initialize or track events without the public API key', async () => {
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_API_KEY', '');

    const { initDashboardAmplitude, isDashboardAmplitudeEnabled, trackDashboardEvent } =
      await import('@/lib/amplitude');

    expect(isDashboardAmplitudeEnabled()).toBe(false);
    expect(initDashboardAmplitude()).toBe(false);
    expect(trackDashboardEvent('dashboard_page_viewed', { route: '/' })).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it('builds conservative browser options by default', async () => {
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_API_KEY', 'public-key');
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_SERVER_ZONE', 'EU');

    const { getBrowserAmplitudeOptions } = await import('@/lib/amplitude');

    expect(getBrowserAmplitudeOptions()).toEqual({
      autocapture: false,
      logLevel: 'none',
      remoteConfig: {
        fetchRemoteConfig: false,
      },
      serverZone: 'EU',
      trackingOptions: {
        ipAddress: false,
      },
    });
  });

  it('enables only safe autocapture groups when opted in', async () => {
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_API_KEY', 'public-key');
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_AUTOCAPTURE', 'true');

    const { getBrowserAmplitudeOptions } = await import('@/lib/amplitude');

    expect(getBrowserAmplitudeOptions().autocapture).toEqual({
      attribution: true,
      elementInteractions: false,
      fileDownloads: false,
      formInteractions: false,
      frustrationInteractions: false,
      networkTracking: false,
      pageUrlEnrichment: true,
      pageViews: false,
      sessions: true,
      webVitals: false,
    });
  });

  it('initializes once and updates the authenticated user id safely', async () => {
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_API_KEY', 'public-key');

    const { initDashboardAmplitude } = await import('@/lib/amplitude');

    expect(initDashboardAmplitude('discord-user-123')).toBe(true);
    expect(initDashboardAmplitude('discord-user-123')).toBe(true);
    expect(initDashboardAmplitude('discord-user-456')).toBe(true);
    expect(initDashboardAmplitude(null)).toBe(true);

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith(
      'public-key',
      'discord-user-123',
      expect.objectContaining({ autocapture: false }),
    );
    expect(mockSetUserId).toHaveBeenCalledWith('discord-user-456');
    expect(mockReset).toHaveBeenCalledOnce();
  });

  it('tracks sanitized dashboard events', async () => {
    vi.stubEnv('NEXT_PUBLIC_AMPLITUDE_API_KEY', 'public-key');

    const { trackDashboardEvent } = await import('@/lib/amplitude');
    const shared = { ok: true };
    const cyclic = ['root'] as unknown[];
    cyclic.push(cyclic);

    expect(
      trackDashboardEvent(' dashboard_button_clicked ', {
        guildId: 'guild-12345',
        password: 'secret',
        nested: {
          token: 'secret',
          ok: true,
        },
        first: shared,
        second: shared,
        cyclic,
      }),
    ).toBe(true);

    expect(mockTrack).toHaveBeenCalledWith('dashboard_button_clicked', {
      guildId: 'guild-12345',
      nested: {
        ok: true,
      },
      first: { ok: true },
      second: { ok: true },
      cyclic: ['root', '[Circular]'],
    });
  });
});
