/**
 * Tests for src/api/middleware/auditLog.js
 * Covers action derivation, config diff computation, and middleware behaviour.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => {
  let currentConfig = { auditLog: { enabled: true, retentionDays: 90 } };
  return {
    getConfig: vi.fn(() => currentConfig),
    _setTestConfig: (c) => {
      currentConfig = c;
    },
  };
});

import {
  auditLogMiddleware,
  computeConfigDiff,
  deriveAction,
} from '../../../src/api/middleware/auditLog.js';
import { _setTestConfig } from '../../../src/modules/config.js';

describe('auditLog middleware', () => {
  afterEach(() => {
    vi.clearAllMocks();
    _setTestConfig({ auditLog: { enabled: true, retentionDays: 90 } });
  });

  // ─── deriveAction ─────────────────────────────────────────────

  describe('deriveAction', () => {
    it('should derive config.update for PUT config', () => {
      expect(deriveAction('PUT', '/api/v1/guilds/123/config')).toBe('config.update');
    });

    it('should derive config.update for PATCH config', () => {
      expect(deriveAction('PATCH', '/api/v1/guilds/123/config')).toBe('config.update');
    });

    it('should derive members.update for member operations', () => {
      expect(deriveAction('PATCH', '/api/v1/guilds/123/members/456')).toBe('members.update');
    });

    it('should derive moderation.create for POST moderation', () => {
      expect(deriveAction('POST', '/api/v1/moderation/warn')).toBe('moderation.create');
    });

    it('should handle unknown paths gracefully', () => {
      const action = deriveAction('POST', '/api/v1');
      expect(action).toBe('post.unknown');
    });

    it('should derive guild.update for guild-level operations', () => {
      expect(deriveAction('PUT', '/api/v1/guilds/123')).toBe('guild.update');
    });
  });

  // ─── computeConfigDiff ────────────────────────────────────────

  describe('computeConfigDiff', () => {
    it('should detect changed keys', () => {
      const before = { ai: { enabled: true }, welcome: { enabled: false } };
      const after = { ai: { enabled: false }, welcome: { enabled: false } };

      const diff = computeConfigDiff(before, after);
      expect(diff.before).toHaveProperty('ai');
      expect(diff.after).toHaveProperty('ai');
      expect(diff.before).not.toHaveProperty('welcome');
    });

    it('should detect added keys', () => {
      const before = { ai: { enabled: true } };
      const after = { ai: { enabled: true }, newSection: { foo: 'bar' } };

      const diff = computeConfigDiff(before, after);
      expect(diff.after).toHaveProperty('newSection');
      expect(diff.before.newSection).toBeUndefined();
    });

    it('should detect removed keys', () => {
      const before = { ai: { enabled: true }, old: { x: 1 } };
      const after = { ai: { enabled: true } };

      const diff = computeConfigDiff(before, after);
      expect(diff.before).toHaveProperty('old');
      expect(diff.after.old).toBeUndefined();
    });

    it('should return empty diff when configs are identical', () => {
      const config = { ai: { enabled: true }, welcome: { enabled: false } };
      const diff = computeConfigDiff(config, config);
      expect(Object.keys(diff.before)).toHaveLength(0);
      expect(Object.keys(diff.after)).toHaveLength(0);
    });

    it('should handle null/undefined inputs', () => {
      const diff = computeConfigDiff(null, { ai: true });
      expect(diff.after).toHaveProperty('ai');
    });
  });

  // ─── middleware behaviour ─────────────────────────────────────

  describe('middleware', () => {
    function createMockReq(method = 'POST', path = '/api/v1/guilds/123/config') {
      const listeners = {};
      return {
        method,
        path,
        originalUrl: path,
        body: { ai: { enabled: true } },
        user: { userId: 'user1' },
        authMethod: 'oauth',
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        app: {
          locals: {
            dbPool: {
              query: vi.fn().mockResolvedValue({}),
            },
          },
        },
        on: vi.fn((event, cb) => {
          listeners[event] = cb;
        }),
        _listeners: listeners,
      };
    }

    function createMockRes(statusCode = 200) {
      const listeners = {};
      return {
        statusCode,
        on: vi.fn((event, cb) => {
          listeners[event] = cb;
        }),
        _listeners: listeners,
      };
    }

    it('should skip non-mutating methods', () => {
      const middleware = auditLogMiddleware();
      const req = createMockReq('GET');
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('should call next immediately (non-blocking)', () => {
      const middleware = auditLogMiddleware();
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('should register a finish listener on the response', () => {
      const middleware = auditLogMiddleware();
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should insert audit entry on successful response finish', () => {
      const middleware = auditLogMiddleware();
      const req = createMockReq();
      const res = createMockRes(200);
      const next = vi.fn();

      middleware(req, res, next);

      // Simulate response finish
      const finishCb = res._listeners.finish;
      finishCb();

      expect(req.app.locals.dbPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO audit_logs'),
        expect.arrayContaining(['123', 'user1']),
      );
    });

    it('should not insert audit entry on failed response (4xx)', () => {
      const middleware = auditLogMiddleware();
      const req = createMockReq();
      const res = createMockRes(400);
      const next = vi.fn();

      middleware(req, res, next);

      const finishCb = res._listeners.finish;
      finishCb();

      expect(req.app.locals.dbPool.query).not.toHaveBeenCalled();
    });

    it('should skip when auditLog is disabled in config', () => {
      _setTestConfig({ auditLog: { enabled: false } });

      const middleware = auditLogMiddleware();
      const req = createMockReq();
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.on).not.toHaveBeenCalled();
    });

    it('should skip when dbPool is unavailable', () => {
      const middleware = auditLogMiddleware();
      const req = createMockReq();
      req.app.locals.dbPool = null;
      const res = createMockRes();
      const next = vi.fn();

      middleware(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.on).not.toHaveBeenCalled();
    });
  });
});
