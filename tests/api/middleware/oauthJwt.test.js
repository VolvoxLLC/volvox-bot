import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import { getBearerToken, handleOAuthJwt } from '../../../src/api/middleware/oauthJwt.js';

// Mock verifyJwtToken at the module level
vi.mock('../../../src/api/middleware/verifyJwt.js', () => ({
  verifyJwtToken: vi.fn(),
  _resetSecretCache: vi.fn(),
}));

import { verifyJwtToken } from '../../../src/api/middleware/verifyJwt.js';

describe('oauthJwt', () => {
  describe('getBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
      expect(getBearerToken('Bearer abc123')).toBe('abc123');
    });

    it('should return null for non-Bearer header', () => {
      expect(getBearerToken('Basic abc123')).toBeNull();
    });

    it('should return null for undefined header', () => {
      expect(getBearerToken(undefined)).toBeNull();
    });
  });

  describe('handleOAuthJwt', () => {
    it('should return false when no Bearer token and no missingTokenError', async () => {
      const req = { headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      const handled = await handleOAuthJwt(req, res, next);
      expect(handled).toBe(false);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 401 when no token and missingTokenError is set', async () => {
      const req = { headers: {} };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      const handled = await handleOAuthJwt(req, res, next, { missingTokenError: 'No token' });
      expect(handled).toBe(true);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'No token' });
    });

    it('should call next and set req.user on valid token', async () => {
      verifyJwtToken.mockResolvedValue({ user: { userId: '123' } });
      const req = { headers: { authorization: 'Bearer valid-token' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      const handled = await handleOAuthJwt(req, res, next);
      expect(handled).toBe(true);
      expect(req.authMethod).toBe('oauth');
      expect(req.user).toEqual({ userId: '123' });
      expect(next).toHaveBeenCalled();
    });

    it('should return error status when token verification fails', async () => {
      verifyJwtToken.mockResolvedValue({ error: 'Invalid', status: 401 });
      const req = {
        headers: { authorization: 'Bearer bad-token' },
        ip: '127.0.0.1',
        path: '/test',
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      const handled = await handleOAuthJwt(req, res, next);
      expect(handled).toBe(true);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should log when SESSION_SECRET is not configured (500 status)', async () => {
      verifyJwtToken.mockResolvedValue({ error: 'Session not configured', status: 500 });
      const req = {
        headers: { authorization: 'Bearer some-token' },
        ip: '127.0.0.1',
        path: '/test',
      };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      await handleOAuthJwt(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});
