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

  it('preserves repeated log references and marks true cyclic arrays', () => {
    const callback = vi.fn();
    const shared = { ok: true };
    const cyclic = ['root'];
    cyclic.push(cyclic);
    const sharedArray = ['shared'];

    transport.log(
      {
        level: 'info',
        message: 'shared refs',
        first: shared,
        second: shared,
        cyclic,
        firstArray: sharedArray,
        secondArray: sharedArray,
      },
      callback,
    );

    expect(mockTrackAnalyticsEvent).toHaveBeenCalledWith('bot_log_recorded', {
      level: 'info',
      message: 'shared refs',
      first: { ok: true },
      second: { ok: true },
      cyclic: ['root', '[Circular]'],
      firstArray: ['shared'],
      secondArray: ['shared'],
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

  it('strips sensitive keys from log metadata before tracking', () => {
    const callback = vi.fn();

    transport.log(
      {
        level: 'info',
        message: 'Sensitive test',
        authorization: 'Bearer secret',
        cookie: 'session=abc',
        token: 'tok',
        password: 'hunter2',
        secret: 'shh',
        apiKey: 'key123',
        safeField: 'keep-me',
      },
      callback,
    );

    const [, properties] = mockTrackAnalyticsEvent.mock.calls[0];
    expect(properties.authorization).toBeUndefined();
    expect(properties.cookie).toBeUndefined();
    expect(properties.token).toBeUndefined();
    expect(properties.password).toBeUndefined();
    expect(properties.secret).toBeUndefined();
    expect(properties.apiKey).toBeUndefined();
    expect(properties.safeField).toBe('keep-me');
  });

  it('strips reserved keys (timestamp, originalLevel, splat) but includes level and message in properties', () => {
    const callback = vi.fn();

    transport.log(
      {
        level: 'info',
        message: 'Reserve test',
        timestamp: '2026-01-01T00:00:00.000Z',
        originalLevel: 'info',
        splat: ['noise'],
        realMeta: 'keep',
      },
      callback,
    );

    const [, properties] = mockTrackAnalyticsEvent.mock.calls[0];
    expect(properties.level).toBe('info');
    expect(properties.message).toBe('Reserve test');
    expect(properties.timestamp).toBeUndefined();
    expect(properties.originalLevel).toBeUndefined();
    expect(properties.splat).toBeUndefined();
    expect(properties.realMeta).toBe('keep');
  });

  it('coerces non-string message to string', () => {
    const callback = vi.fn();

    transport.log({ level: 'info', message: 12345 }, callback);

    const [, properties] = mockTrackAnalyticsEvent.mock.calls[0];
    expect(properties.message).toBe('12345');
  });

  it('does not call trackAnalyticsEvent for debug level', () => {
    const callback = vi.fn();

    transport.log({ level: 'debug', message: 'Debug noise' }, callback);

    expect(mockTrackAnalyticsEvent).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('uses AMPLITUDE_LOG_EVENT as the event type', () => {
    const callback = vi.fn();

    transport.log({ level: 'info', message: 'event type check' }, callback);

    expect(mockTrackAnalyticsEvent).toHaveBeenCalledWith('bot_log_recorded', expect.any(Object));
  });
});
