import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockTrackAnalyticsEvent } = vi.hoisted(() => ({
  mockTrackAnalyticsEvent: vi.fn(),
}));

vi.mock('../../src/amplitude.js', () => ({
  AMPLITUDE_LOG_EVENT: 'bot_log_recorded',
  trackAnalyticsEvent: mockTrackAnalyticsEvent,
}));

vi.mock('winston-transport', () => {
  class Transport {
    constructor(opts = {}) {
      this.level = opts.level;
    }
  }

  return { default: Transport };
});

import { AmplitudeTransport } from '../../src/transports/amplitude.js';

describe('AmplitudeTransport', () => {
  let transport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new AmplitudeTransport();
  });

  it('defaults to info-level logging', () => {
    expect(transport.level).toBe('info');
  });

  it('allows overriding the transport level', () => {
    const warnOnlyTransport = new AmplitudeTransport({ level: 'warn' });
    expect(warnOnlyTransport.level).toBe('warn');
  });

  it('forwards info logs as sanitized Amplitude events', () => {
    const callback = vi.fn();

    transport.log(
      {
        level: 'info',
        message: 'Bot ready',
        module: 'startup',
        originalLevel: 'info',
        password: 'secret',
        splat: ['noise'],
      },
      callback,
    );

    expect(mockTrackAnalyticsEvent).toHaveBeenCalledWith('bot_log_recorded', {
      level: 'info',
      message: 'Bot ready',
      module: 'startup',
    });
    expect(callback).toHaveBeenCalledOnce();
  });

  it('forwards warnings to Amplitude and leaves errors for Sentry', () => {
    const callback = vi.fn();

    transport.log({ level: 'warn', message: 'Rate limit close', source: 'api' }, callback);
    transport.log({ level: 'error', message: 'Database blew up' }, callback);

    expect(mockTrackAnalyticsEvent).toHaveBeenCalledOnce();
    expect(mockTrackAnalyticsEvent).toHaveBeenCalledWith('bot_log_recorded', {
      level: 'warn',
      message: 'Rate limit close',
      source: 'api',
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('sanitizes nested log metadata before tracking', () => {
    const callback = vi.fn();
    const seen = { ok: true };
    const circular = { seen };
    circular.self = circular;
    const createdAt = new Date('2026-04-30T12:00:00.000Z');
    const err = new TypeError('bad input');

    transport.log(
      {
        level: 'info',
        message: { toString: () => 'object message' },
        nested: {
          authorization: 'Bearer secret',
          createdAt,
          err,
          circular,
          rows: [{ email: 'person@example.com' }, { ok: true }],
        },
      },
      callback,
    );

    expect(mockTrackAnalyticsEvent).toHaveBeenCalledWith('bot_log_recorded', {
      level: 'info',
      message: 'object message',
      nested: {
        createdAt: '2026-04-30T12:00:00.000Z',
        err: {
          message: 'bad input',
          name: 'TypeError',
        },
        circular: {
          seen: {
            ok: true,
          },
          self: '[Circular]',
        },
        rows: [{}, { ok: true }],
      },
    });
    expect(callback).toHaveBeenCalledOnce();
  });

  it('still completes the Winston callback if Amplitude tracking throws', () => {
    const callback = vi.fn();
    mockTrackAnalyticsEvent.mockImplementationOnce(() => {
      throw new Error('amplitude down');
    });

    transport.log({ level: 'info', message: 'startup' }, callback);

    expect(callback).toHaveBeenCalledOnce();
  });
});
