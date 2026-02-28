/**
 * Coverage tests for src/api/routes/auth.js
 * Tests: OAuth flow edge cases, invalid tokens, session expiry, dashboard URL validation
 */
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import { _seedOAuthState } from '../../../src/api/routes/auth.js';
import { createApp } from '../../../src/api/server.js';
import { guildCache } from '../../../src/api/utils/discordApi.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';
import { warn } from '../../../src/logger.js';

describe('auth routes coverage', () => {
  let app;

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    const client = {
      guilds: { cache: new Map() },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };
    app = createApp(client, null);
  });

  beforeEach(() => {
    // Reset JWT secret cache so each test reads from current env
    _resetSecretCache();
  });

  afterEach(() => {
    sessionStore.clear();
    guildCache.clear();
    _resetSecretCache();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/auth/discord/callback - edge cases', () => {
    it('returns 502 when token exchange returns invalid access_token', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', 'cid');
      vi.stubEnv('DISCORD_CLIENT_SECRET', 'csecret');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:3001/callback');
      vi.stubEnv('SESSION_SECRET', 'sess-secret');

      const state = 'state-bad-token';
      _seedOAuthState(state);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: '' }), // empty string - invalid
      });

      const res = await request(app).get(
        `/api/v1/auth/discord/callback?code=code&state=${state}`,
      );
      expect(res.status).toBe(502);
      expect(res.body.error).toContain('Invalid response from Discord');
    });

    it('returns 502 when token exchange returns non-string access_token', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', 'cid');
      vi.stubEnv('DISCORD_CLIENT_SECRET', 'csecret');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:3001/callback');
      vi.stubEnv('SESSION_SECRET', 'sess-secret');

      const state = 'state-null-token';
      _seedOAuthState(state);

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: null }),
      });

      const res = await request(app).get(
        `/api/v1/auth/discord/callback?code=code&state=${state}`,
      );
      expect(res.status).toBe(502);
    });

    it('returns 502 when user fetch returns invalid user id', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', 'cid');
      vi.stubEnv('DISCORD_CLIENT_SECRET', 'csecret');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:3001/callback');
      vi.stubEnv('SESSION_SECRET', 'sess-secret');

      const state = 'state-bad-user';
      _seedOAuthState(state);

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'valid-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: '', username: 'test' }), // empty id
        });

      const res = await request(app).get(
        `/api/v1/auth/discord/callback?code=code&state=${state}`,
      );
      expect(res.status).toBe(502);
    });

    it('returns 502 when user fetch returns no id field', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', 'cid');
      vi.stubEnv('DISCORD_CLIENT_SECRET', 'csecret');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:3001/callback');
      vi.stubEnv('SESSION_SECRET', 'sess-secret');

      const state = 'state-no-id';
      _seedOAuthState(state);

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'valid-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ username: 'test' }), // missing id
        });

      const res = await request(app).get(
        `/api/v1/auth/discord/callback?code=code&state=${state}`,
      );
      expect(res.status).toBe(502);
    });

    it('returns 500 when missing OAuth2 config vars in callback', async () => {
      // Missing DISCORD_CLIENT_SECRET
      vi.stubEnv('DISCORD_CLIENT_ID', 'cid');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost/callback');
      vi.stubEnv('SESSION_SECRET', 'sess');

      const state = 'state-missing-config';
      _seedOAuthState(state);

      const res = await request(app).get(
        `/api/v1/auth/discord/callback?code=code&state=${state}`,
      );
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('OAuth2 not configured');
    });

    it('uses invalid DASHBOARD_URL falls back to root /', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', 'cid');
      vi.stubEnv('DISCORD_CLIENT_SECRET', 'csecret');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:3001/callback');
      vi.stubEnv('SESSION_SECRET', 'sess-secret');
      vi.stubEnv('DASHBOARD_URL', 'not-a-valid-url'); // invalid URL

      const state = 'state-invalid-dashboard';
      _seedOAuthState(state);

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'user123', username: 'user', avatar: null }),
        });

      const res = await request(app).get(
        `/api/v1/auth/discord/callback?code=code&state=${state}`,
      );
      expect(res.status).toBe(302);
      // Should redirect to '/' fallback
      expect(res.headers.location).toBe('/');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid DASHBOARD_URL'),
        expect.any(Object),
      );
    });

    it('uses HTTPS DASHBOARD_URL directly', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', 'cid');
      vi.stubEnv('DISCORD_CLIENT_SECRET', 'csecret');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:3001/callback');
      vi.stubEnv('SESSION_SECRET', 'sess-secret');
      vi.stubEnv('DASHBOARD_URL', 'https://dashboard.example.com');

      const state = 'state-https-dashboard';
      _seedOAuthState(state);

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'user456', username: 'user', avatar: null }),
        });

      const res = await request(app).get(
        `/api/v1/auth/discord/callback?code=code&state=${state}`,
      );
      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('https://dashboard.example.com');
    });

    it('returns 500 on unexpected fetch error', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', 'cid');
      vi.stubEnv('DISCORD_CLIENT_SECRET', 'csecret');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:3001/callback');
      vi.stubEnv('SESSION_SECRET', 'sess-secret');

      const state = 'state-fetch-error';
      _seedOAuthState(state);

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const res = await request(app).get(
        `/api/v1/auth/discord/callback?code=code&state=${state}`,
      );
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Authentication failed');
    });

    it('returns 403 for expired state', async () => {
      // State expiry: we can't easily inject an expired state without internal access
      // but we can test that an unknown state returns 403
      const res = await request(app).get(
        '/api/v1/auth/discord/callback?code=code&state=unknown-state',
      );
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Invalid or expired OAuth state');
    });
  });

  describe('GET /api/v1/auth/me - session store errors', () => {
    it('returns 503 when session store throws', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-secret');

      // Create a valid JWT
      const token = jwt.sign(
        { userId: 'u1', username: 'user', avatar: null, jti: 'jti1' },
        'test-secret',
        { algorithm: 'HS256', expiresIn: '1h' },
      );

      // Store a valid session so JWT verification passes
      await sessionStore.set('u1', { accessToken: 'tok', jti: 'jti1' });

      // Make sessionStore.get throw to trigger 503
      vi.spyOn(sessionStore, 'get').mockRejectedValue(new Error('Redis unavailable'));

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toContain('Session lookup failed');
    });

    it('returns user info even without guilds when no accessToken', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-secret');
      vi.stubEnv('DISCORD_CLIENT_ID', 'cid');

      const token = jwt.sign(
        { userId: 'u2', username: 'user2', avatar: null, jti: 'jti2' },
        'test-secret',
        { algorithm: 'HS256', expiresIn: '1h' },
      );

      // Session has no accessToken
      await sessionStore.set('u2', { jti: 'jti2' });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('u2');
      expect(res.body.guilds).toEqual([]);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('clears cookie and returns success', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-secret');

      const token = jwt.sign(
        { userId: 'u3', username: 'user3', avatar: null, jti: 'jti3' },
        'test-secret',
        { algorithm: 'HS256', expiresIn: '1h' },
      );
      await sessionStore.set('u3', { accessToken: 'tok', jti: 'jti3' });

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Logged out');
    });

    it('succeeds even when session delete throws', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-secret');

      const token = jwt.sign(
        { userId: 'u4', username: 'user4', avatar: null, jti: 'jti4' },
        'test-secret',
        { algorithm: 'HS256', expiresIn: '1h' },
      );
      await sessionStore.set('u4', { accessToken: 'tok', jti: 'jti4' });

      vi.spyOn(sessionStore, 'delete').mockRejectedValue(new Error('Redis down'));

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      // Should still succeed
      expect(res.status).toBe(200);
    });
  });


  describe('GET /api/v1/auth/discord/callback - expired state', () => {
    it('returns 403 when state has expired', async () => {
      vi.useFakeTimers();
      const state = 'state-expired-test';

      // Seed state at time 0
      vi.setSystemTime(0);
      _seedOAuthState(state);

      // Advance past STATE_TTL_MS (10 minutes = 600,000ms)
      vi.setSystemTime(10 * 60 * 1000 + 1000); // just past expiry

      const res = await request(app).get(
        `/api/v1/auth/discord/callback?code=code&state=${state}`,
      );

      vi.useRealTimers();
      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Invalid or expired OAuth state');
    });
  });

  describe('GET /api/v1/auth/discord - login redirect', () => {
    it('returns 500 when OAuth env vars not configured', async () => {
      // DISCORD_CLIENT_ID and DISCORD_REDIRECT_URI not set
      const res = await request(app).get('/api/v1/auth/discord');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('OAuth2 not configured');
    });

    it('redirects to Discord when env vars configured', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', 'cid');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:3001/callback');

      const res = await request(app).get('/api/v1/auth/discord');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('discord.com');
    });
  });

  describe('/me - session store error (503)', () => {
    it('returns 503 when session store throws in /me handler', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-secret');

      // Create valid JWT
      const jti = 'jti-503';
      const token = jwt.sign(
        { userId: 'u503', username: 'user', avatar: null, jti },
        'test-secret',
        { algorithm: 'HS256', expiresIn: '1h' },
      );

      // Store session so JWT verification passes (uses getSession from verifyJwt)
      // We need to mock at the sessionStore.get level differently
      // First call (verifyJwt) should succeed, second (in /me handler) should fail
      let callCount = 0;
      vi.spyOn(sessionStore, 'get').mockImplementation(async (userId) => {
        callCount++;
        if (callCount === 1) {
          // verifyJwt call - return valid session
          return { accessToken: 'tok', jti };
        }
        // /me handler call - throw
        throw new Error('Redis down');
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(503);
      expect(res.body.error).toContain('Session store unavailable');
    });
  });
});
