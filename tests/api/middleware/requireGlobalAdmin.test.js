import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({ botOwnerIds: ['owner1', 'owner2'] }),
}));

vi.mock('../../../src/utils/permissions.js', () => ({
  getBotOwnerIds: vi.fn().mockReturnValue(['owner1', 'owner2']),
}));

import { requireGlobalAdmin } from '../../../src/api/middleware/requireGlobalAdmin.js';
import { warn } from '../../../src/logger.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(overrides = {}) {
  return { authMethod: 'api-secret', user: { userId: 'owner1' }, path: '/test', ...overrides };
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('requireGlobalAdmin middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── api-secret auth ───────────────────────────────────────────────────

  describe('api-secret auth', () => {
    it('should call next() for api-secret auth method', () => {
      const req = makeReq({ authMethod: 'api-secret' });
      const res = makeRes();
      const next = vi.fn();

      requireGlobalAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  // ── oauth auth ────────────────────────────────────────────────────────

  describe('oauth auth', () => {
    it('should call next() when user is a bot owner', () => {
      const req = makeReq({ authMethod: 'oauth', user: { userId: 'owner1' } });
      const res = makeRes();
      const next = vi.fn();

      requireGlobalAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should return 403 when user is not a bot owner', () => {
      const req = makeReq({ authMethod: 'oauth', user: { userId: 'nobody' } });
      const res = makeRes();
      const next = vi.fn();

      requireGlobalAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('bot owner') }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle null user gracefully', () => {
      const req = makeReq({ authMethod: 'oauth', user: null });
      const res = makeRes();
      const next = vi.fn();

      requireGlobalAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ── unknown auth ──────────────────────────────────────────────────────

  describe('unknown auth method', () => {
    it('should return 401 for unknown auth method', () => {
      const req = makeReq({ authMethod: 'unknown' });
      const res = makeRes();
      const next = vi.fn();

      requireGlobalAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(warn).toHaveBeenCalledWith(
        'Unknown authMethod in global admin check',
        expect.objectContaining({ authMethod: 'unknown' }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 for undefined auth method', () => {
      const req = makeReq({ authMethod: undefined });
      const res = makeRes();
      const next = vi.fn();

      requireGlobalAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // ── 4-argument form ───────────────────────────────────────────────────

  describe('4-argument form (resource label)', () => {
    it('should support requireGlobalAdmin(resource, req, res, next)', () => {
      const req = makeReq({ authMethod: 'oauth', user: { userId: 'nobody' } });
      const res = makeRes();
      const next = vi.fn();

      requireGlobalAdmin('Backup access', req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Backup access') }),
      );
    });

    it('should use default label when resource is falsy', () => {
      const req = makeReq({ authMethod: 'oauth', user: { userId: 'nobody' } });
      const res = makeRes();
      const next = vi.fn();

      requireGlobalAdmin('', req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('Global admin access') }),
      );
    });
  });
});
