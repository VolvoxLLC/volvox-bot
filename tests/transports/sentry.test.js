import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Sentry module
vi.mock('../../src/sentry.js', () => ({
  Sentry: {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
  },
}));

// Mock winston-transport
vi.mock('winston-transport', () => {
  class Transport {
    constructor(opts = {}) {
      this.level = opts.level;
    }
  }
  return { default: Transport };
});

import { Sentry } from '../../src/sentry.js';
import { SentryTransport } from '../../src/transports/sentry.js';

describe('SentryTransport', () => {
  let transport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new SentryTransport();
  });

  describe('constructor', () => {
    it('should default level to warn', () => {
      const t = new SentryTransport();
      expect(t.level).toBe('warn');
    });

    it('should allow overriding level via opts', () => {
      const t = new SentryTransport({ level: 'error' });
      expect(t.level).toBe('error');
    });
  });

  describe('TAG_KEYS', () => {
    it('should have expected tag keys', () => {
      expect(SentryTransport.TAG_KEYS.has('source')).toBe(true);
      expect(SentryTransport.TAG_KEYS.has('command')).toBe(true);
      expect(SentryTransport.TAG_KEYS.has('module')).toBe(true);
      expect(SentryTransport.TAG_KEYS.has('code')).toBe(true);
      expect(SentryTransport.TAG_KEYS.has('shardId')).toBe(true);
    });
  });

  describe('log() — error level', () => {
    it('should captureException with reconstructed Error when stack is present', () => {
      const callback = vi.fn();
      transport.log(
        {
          level: 'error',
          message: 'Something blew up',
          stack: 'Error: Something blew up\n    at file.js:10',
        },
        callback,
      );

      expect(Sentry.captureException).toHaveBeenCalledOnce();
      const [err, context] = Sentry.captureException.mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Something blew up');
      expect(err.stack).toBe('Error: Something blew up\n    at file.js:10');
      expect(context.tags).toEqual({});
      expect(context.extra).toEqual({});
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should captureMessage with error string metadata pattern', () => {
      const callback = vi.fn();
      transport.log(
        {
          level: 'error',
          message: 'DB query failed',
          error: 'connection refused',
        },
        callback,
      );

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'DB query failed: connection refused',
        expect.objectContaining({ level: 'error' }),
      );
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should captureMessage for plain string error with no stack or error field', () => {
      const callback = vi.fn();
      transport.log(
        {
          level: 'error',
          message: 'Something went wrong',
        },
        callback,
      );

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Something went wrong',
        expect.objectContaining({ level: 'error' }),
      );
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should not use error field if it is not a string', () => {
      const callback = vi.fn();
      transport.log(
        {
          level: 'error',
          message: 'Obj error',
          error: { code: 500 }, // not a string
        },
        callback,
      );

      // Should fall into plain captureMessage (no stack, error not string)
      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Obj error',
        expect.objectContaining({ level: 'error' }),
      );
    });

    it('should promote known meta keys to tags', () => {
      const callback = vi.fn();
      transport.log(
        {
          level: 'error',
          message: 'Tagged error',
          source: 'scheduler',
          command: 'ban',
          module: 'moderation',
          code: 42,
          shardId: 0,
          extraData: { foo: 'bar' },
        },
        callback,
      );

      const [, context] = Sentry.captureMessage.mock.calls[0];
      expect(context.tags).toEqual({
        source: 'scheduler',
        command: 'ban',
        module: 'moderation',
        code: '42',
        shardId: '0',
      });
      expect(context.extra).toEqual({ extraData: { foo: 'bar' } });
    });

    it('should exclude originalLevel and splat from extra', () => {
      const callback = vi.fn();
      transport.log(
        {
          level: 'error',
          message: 'Noise test',
          originalLevel: 'info',
          splat: ['arg1'],
          realExtra: 'keep-me',
        },
        callback,
      );

      const [, context] = Sentry.captureMessage.mock.calls[0];
      expect(context.extra).toEqual({ realExtra: 'keep-me' });
      expect(context.extra.originalLevel).toBeUndefined();
      expect(context.extra.splat).toBeUndefined();
    });
  });

  describe('log() — warn level', () => {
    it('should captureMessage with warning level', () => {
      const callback = vi.fn();
      transport.log(
        {
          level: 'warn',
          message: 'Watch out',
          source: 'health',
        },
        callback,
      );

      expect(Sentry.captureMessage).toHaveBeenCalledWith(
        'Watch out',
        expect.objectContaining({ level: 'warning' }),
      );
      const [, context] = Sentry.captureMessage.mock.calls[0];
      expect(context.tags).toEqual({ source: 'health' });
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should not call captureException for warn level', () => {
      transport.log({ level: 'warn', message: 'warn msg' }, vi.fn());
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });

  describe('log() — unknown level', () => {
    it('should not call capture for unknown level', () => {
      const callback = vi.fn();
      transport.log({ level: 'info', message: 'just info' }, callback);
      expect(Sentry.captureException).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledOnce();
    });
  });
});
