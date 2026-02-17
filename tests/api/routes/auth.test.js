import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { sessionStore } from '../../../src/api/routes/auth.js';
import { createApp } from '../../../src/api/server.js';

describe('auth routes', () => {
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

  afterEach(() => {
    sessionStore.clear();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/auth/discord', () => {
    it('should redirect to Discord OAuth2 URL when configured', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', 'client-id-123');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:3000/callback');

      const res = await request(app).get('/api/v1/auth/discord');

      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('discord.com/oauth2/authorize');
      expect(res.headers.location).toContain('client_id=client-id-123');
      expect(res.headers.location).toContain('scope=identify+guilds');
      expect(res.headers.location).toContain('state=');
    });

    it('should return 500 when DISCORD_CLIENT_ID is not set', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', '');
      vi.stubEnv('DISCORD_REDIRECT_URI', 'http://localhost:3000/callback');

      const res = await request(app).get('/api/v1/auth/discord');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('OAuth2 not configured');
    });

    it('should return 500 when DISCORD_REDIRECT_URI is not set', async () => {
      vi.stubEnv('DISCORD_CLIENT_ID', 'client-id-123');
      vi.stubEnv('DISCORD_REDIRECT_URI', '');

      const res = await request(app).get('/api/v1/auth/discord');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('OAuth2 not configured');
    });
  });

  describe('GET /api/v1/auth/discord/callback', () => {
    it('should return 400 when code is missing', async () => {
      const res = await request(app).get('/api/v1/auth/discord/callback');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Missing authorization code');
    });

    it('should return 403 when state is missing or invalid', async () => {
      const res = await request(app).get('/api/v1/auth/discord/callback?code=test-code');

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Invalid or expired OAuth state');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user info from valid JWT', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-session-secret');

      const mockGuilds = [{ id: 'g1', name: 'Test Guild', permissions: '8' }];
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockGuilds,
      });

      // Store access token server-side (no longer in JWT)
      sessionStore.set('123', 'discord-access-token');

      const token = jwt.sign(
        {
          userId: '123',
          username: 'testuser',
          discriminator: '0001',
          avatar: 'abc123',
        },
        'test-session-secret',
        { algorithm: 'HS256' },
      );

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('123');
      expect(res.body.username).toBe('testuser');
      expect(res.body.guilds).toHaveLength(1);
    });

    it('should return user info without guilds when fetch fails', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-session-secret');

      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      // Store access token server-side (no longer in JWT)
      sessionStore.set('123', 'discord-access-token');

      const token = jwt.sign(
        {
          userId: '123',
          username: 'testuser',
          discriminator: '0001',
          avatar: 'abc123',
        },
        'test-session-secret',
        { algorithm: 'HS256' },
      );

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.userId).toBe('123');
      expect(res.body.guilds).toHaveLength(0);
    });

    it('should return 401 when no token provided', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });

    it('should return 401 for invalid token', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-session-secret');

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid or expired token');
    });

    it('should return 500 when SESSION_SECRET is not set', async () => {
      vi.stubEnv('SESSION_SECRET', '');

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer some-token');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Session not configured');
    });

    it('should return 401 when session has been revoked', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-session-secret');

      // Sign a valid JWT but do NOT populate sessionStore
      const token = jwt.sign(
        {
          userId: '456',
          username: 'revokeduser',
          discriminator: '0002',
          avatar: 'def456',
        },
        'test-session-secret',
        { algorithm: 'HS256' },
      );

      const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Session expired or revoked');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should delete session and return success when authenticated', async () => {
      vi.stubEnv('SESSION_SECRET', 'test-session-secret');

      sessionStore.set('123', 'discord-access-token');
      const token = jwt.sign({ userId: '123', username: 'testuser' }, 'test-session-secret', {
        algorithm: 'HS256',
      });

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Logged out successfully');
      expect(sessionStore.has('123')).toBe(false);
    });

    it('should return 401 when no token provided', async () => {
      const res = await request(app).post('/api/v1/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('No token provided');
    });
  });
});
