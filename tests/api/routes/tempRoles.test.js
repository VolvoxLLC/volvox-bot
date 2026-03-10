import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/tempRoleHandler.js', () => ({
  assignTempRole: vi.fn(),
  listTempRoles: vi.fn(),
  revokeTempRoleById: vi.fn(),
}));

import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import { createApp } from '../../../src/api/server.js';
import { guildCache } from '../../../src/api/utils/discordApi.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';
import { revokeTempRoleById } from '../../../src/modules/tempRoleHandler.js';

describe('temp roles routes', () => {
  let app;

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', 'test-secret');
    vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');

    const client = {
      guilds: {
        cache: new Map(),
        fetch: vi.fn(),
      },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };

    app = createApp(client, null);
  });

  afterEach(() => {
    sessionStore.clear();
    guildCache.clear();
    _resetSecretCache();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function createOAuthToken(userId = '123') {
    const jti = `test-jti-${userId}`;
    sessionStore.set(userId, { accessToken: 'discord-access-token', jti });
    return jwt.sign(
      {
        userId,
        username: 'testuser',
        jti,
      },
      'jwt-test-secret',
      { algorithm: 'HS256' },
    );
  }

  it('returns 400 when guildId query param is missing on DELETE', async () => {
    const token = createOAuthToken('user-no-guild');

    const res = await request(app)
      .delete('/api/v1/temp-roles/55')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/guildId/i);
    expect(revokeTempRoleById).not.toHaveBeenCalled();
  });

  it('allows DELETE /temp-roles/:id for a moderator with valid guildId and record id', async () => {
    const token = createOAuthToken('user-mod');

    // Mock Discord guilds API — return MANAGE_GUILD permission (0x20)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'guild-123', permissions: String(0x20) }],
    });

    const fakeRecord = {
      id: 55,
      user_id: 'target-user',
      role_id: 'role-abc',
      guild_id: 'guild-123',
    };
    revokeTempRoleById.mockResolvedValueOnce(fakeRecord);

    // Stub Discord client so best-effort role removal is skipped gracefully
    app.locals = app.locals || {};
    app.locals.client = null;

    const res = await request(app)
      .delete('/api/v1/temp-roles/55?guildId=guild-123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(revokeTempRoleById).toHaveBeenCalledWith(55, 'guild-123');
  });

  it('blocks DELETE /temp-roles/:id for oauth users without moderator access', async () => {
    const token = createOAuthToken('user-no-mod');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'guild-123', permissions: '0' }],
    });

    const res = await request(app)
      .delete('/api/v1/temp-roles/55?guildId=guild-123')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You do not have moderator access to this guild');
    expect(revokeTempRoleById).not.toHaveBeenCalled();
  });
});
