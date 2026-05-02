import { randomUUID } from 'node:crypto';
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
import {
  assignTempRole,
  listTempRoles,
  revokeTempRoleById,
} from '../../../src/modules/tempRoleHandler.js';

describe('temp roles routes', () => {
  let app;
  let sessionSecret;
  let botApiSecret;

  beforeEach(() => {
    sessionSecret = randomUUID();
    botApiSecret = randomUUID();
    vi.stubEnv('BOT_API_SECRET', botApiSecret);
    vi.stubEnv('SESSION_SECRET', sessionSecret);

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
    sessionStore.set(userId, { accessToken: `discord-access-token-${randomUUID()}`, jti });
    return jwt.sign(
      {
        userId,
        username: 'testuser',
        jti,
      },
      sessionSecret,
      { algorithm: 'HS256' },
    );
  }

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

  it('returns 400 when listing temp roles without guildId', async () => {
    const res = await request(app).get('/api/v1/temp-roles').set('x-api-secret', botApiSecret);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('guildId is required');
    expect(listTempRoles).not.toHaveBeenCalled();
  });

  it('lists temp roles with normalized pagination and user filter', async () => {
    listTempRoles.mockResolvedValueOnce({
      rows: [{ id: 1, user_id: 'user-1', role_id: 'role-1' }],
      total: 21,
    });

    const res = await request(app)
      .get('/api/v1/temp-roles?guildId=guild-123&userId=user-1&page=2&limit=10')
      .set('x-api-secret', botApiSecret);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: [{ id: 1, user_id: 'user-1', role_id: 'role-1' }],
      pagination: { page: 2, limit: 10, total: 21, pages: 3 },
    });
    expect(listTempRoles).toHaveBeenCalledWith('guild-123', {
      userId: 'user-1',
      limit: 10,
      offset: 10,
    });
  });

  it('returns 500 when listing temp roles fails', async () => {
    listTempRoles.mockRejectedValueOnce(new Error('db down'));

    const res = await request(app)
      .get('/api/v1/temp-roles?guildId=guild-123')
      .set('x-api-secret', botApiSecret);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch temp roles');
  });

  it('returns 400 when deleting a temp role without guildId', async () => {
    const res = await request(app)
      .delete('/api/v1/temp-roles/55')
      .set('x-api-secret', botApiSecret);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('guildId is required');
    expect(revokeTempRoleById).not.toHaveBeenCalled();
  });

  it('returns 400 when deleting a temp role with an invalid id', async () => {
    const res = await request(app)
      .delete('/api/v1/temp-roles/nope?guildId=guild-123')
      .set('x-api-secret', botApiSecret);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid id');
    expect(revokeTempRoleById).not.toHaveBeenCalled();
  });

  it('returns 404 when the temp role record is missing', async () => {
    revokeTempRoleById.mockResolvedValueOnce(null);

    const res = await request(app)
      .delete('/api/v1/temp-roles/55?guildId=guild-123')
      .set('x-api-secret', botApiSecret);

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
    expect(revokeTempRoleById).toHaveBeenCalledWith(55, 'guild-123');
  });

  it('revokes a temp role and removes the role from Discord when possible', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const fetchMember = vi.fn().mockResolvedValue({
      roles: { remove },
    });
    const fetchGuild = vi.fn().mockResolvedValue({
      members: { fetch: fetchMember },
    });

    revokeTempRoleById.mockResolvedValueOnce({
      user_id: 'user-1',
      role_id: 'role-1',
    });

    app.locals.client.guilds.fetch = fetchGuild;

    const res = await request(app)
      .delete('/api/v1/temp-roles/55?guildId=guild-123')
      .set('x-api-secret', botApiSecret);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fetchGuild).toHaveBeenCalledWith('guild-123');
    expect(fetchMember).toHaveBeenCalledWith('user-1');
    expect(remove).toHaveBeenCalledWith('role-1', 'Temp role revoked via dashboard');
  });

  it('returns 400 when creating a temp role without required fields', async () => {
    const res = await request(app)
      .post('/api/v1/temp-roles')
      .set('x-api-secret', botApiSecret)
      .send({ guildId: 'guild-123', userId: 'user-1' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('required');
    expect(assignTempRole).not.toHaveBeenCalled();
  });

  it('returns 400 when creating a temp role with an invalid duration', async () => {
    const res = await request(app)
      .post('/api/v1/temp-roles')
      .set('x-api-secret', botApiSecret)
      .send({
        guildId: 'guild-123',
        userId: 'user-1',
        roleId: 'role-1',
        duration: 'banana',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid duration');
    expect(assignTempRole).not.toHaveBeenCalled();
  });

  it('returns 400 when Discord objects cannot be resolved during creation', async () => {
    app.locals.client.guilds.fetch.mockRejectedValueOnce(new Error('missing guild'));

    const res = await request(app)
      .post('/api/v1/temp-roles')
      .set('x-api-secret', botApiSecret)
      .send({
        guildId: 'guild-123',
        userId: 'user-1',
        roleId: 'role-1',
        duration: '1h',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid guild, user, or role');
  });

  it('returns 400 when the role fetch returns nothing', async () => {
    const fetchMember = vi.fn().mockResolvedValue({
      user: { tag: 'User#0001' },
      roles: { add: vi.fn().mockResolvedValue(undefined) },
    });
    const fetchRole = vi.fn().mockResolvedValue(null);

    app.locals.client.guilds.fetch.mockResolvedValueOnce({
      members: { fetch: fetchMember },
      roles: { fetch: fetchRole },
    });

    const res = await request(app)
      .post('/api/v1/temp-roles')
      .set('x-api-secret', botApiSecret)
      .send({
        guildId: 'guild-123',
        userId: 'user-1',
        roleId: 'role-1',
        duration: '1h',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Role not found');
  });

  it('creates a temp role assignment and returns the stored record', async () => {
    const addRole = vi.fn().mockResolvedValue(undefined);
    const member = {
      user: { tag: 'User#0001' },
      roles: { add: addRole },
    };
    const role = { name: 'Muted' };

    app.locals.client.guilds.fetch.mockResolvedValueOnce({
      members: { fetch: vi.fn().mockResolvedValue(member) },
      roles: { fetch: vi.fn().mockResolvedValue(role) },
    });
    assignTempRole.mockResolvedValueOnce({
      id: 77,
      guildId: 'guild-123',
      userId: 'user-1',
      roleId: 'role-1',
    });

    const res = await request(app)
      .post('/api/v1/temp-roles')
      .set('x-api-secret', botApiSecret)
      .send({
        guildId: 'guild-123',
        userId: 'user-1',
        roleId: 'role-1',
        duration: '2h',
        reason: 'Testing',
      });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      success: true,
      data: {
        id: 77,
        guildId: 'guild-123',
        userId: 'user-1',
        roleId: 'role-1',
      },
    });
    expect(addRole).toHaveBeenCalledWith('role-1', 'Testing');
    expect(assignTempRole).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-123',
        userId: 'user-1',
        roleId: 'role-1',
        roleName: 'Muted',
        userTag: 'User#0001',
        reason: 'Testing',
        moderatorId: 'dashboard',
        moderatorTag: 'Dashboard',
      }),
    );
  });
});
