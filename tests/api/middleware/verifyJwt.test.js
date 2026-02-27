import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

import { _resetSecretCache, verifyJwtToken } from '../../../src/api/middleware/verifyJwt.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';

describe('verifyJwt', () => {
  beforeEach(() => {
    _resetSecretCache();
    sessionStore.clear();
  });

  afterEach(() => {
    _resetSecretCache();
    sessionStore.clear();
    vi.unstubAllEnvs();
  });

  it('should return user for valid token with matching session', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    sessionStore.set('user-1', { accessToken: 'tok', jti: undefined });
    const token = jwt.sign({ userId: 'user-1' }, 'test-secret', { algorithm: 'HS256' });

    const result = await verifyJwtToken(token);
    expect(result).toHaveProperty('user');
    expect(result.user.userId).toBe('user-1');
  });

  it('should return 500 error when SESSION_SECRET is not set', async () => {
    vi.stubEnv('SESSION_SECRET', '');
    const result = await verifyJwtToken('any-token');
    expect(result).toEqual({ error: 'Session not configured', status: 500 });
  });

  it('should return 401 for expired token', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    const token = jwt.sign({ userId: 'user-1' }, 'test-secret', { expiresIn: '-1s' });

    const result = await verifyJwtToken(token);
    expect(result).toEqual({ error: 'Invalid or expired token', status: 401 });
  });

  it('should return 401 when session does not exist', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    const token = jwt.sign({ userId: 'no-session' }, 'test-secret');

    const result = await verifyJwtToken(token);
    expect(result).toEqual({ error: 'Session expired or revoked', status: 401 });
  });

  it('should return 401 when jti does not match session nonce', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-secret');
    sessionStore.set('user-1', { accessToken: 'tok', jti: 'nonce-a' });
    const token = jwt.sign({ userId: 'user-1', jti: 'nonce-b' }, 'test-secret');

    const result = await verifyJwtToken(token);
    expect(result).toEqual({ error: 'Session expired or revoked', status: 401 });
  });
});
