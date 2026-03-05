import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/api/utils/validateWebhookUrl.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, validateDnsResolution: vi.fn().mockResolvedValue(true) };
});

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    ai: { enabled: true },
    welcome: { enabled: true },
    spam: { enabled: true },
    moderation: { enabled: true },
    permissions: { botOwners: [] },
  }),
  setConfigValue: vi.fn().mockResolvedValue({}),
}));

const tempRoleMocks = vi.hoisted(() => ({
  assignTempRole: vi.fn(),
  listTempRoles: vi.fn(),
  revokeTempRoleById: vi.fn(),
}));

vi.mock('../../../src/modules/tempRoleHandler.js', () => tempRoleMocks);

import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import { createApp } from '../../../src/api/server.js';
import {
  assignTempRole,
  listTempRoles,
  revokeTempRoleById,
} from '../../../src/modules/tempRoleHandler.js';

describe('temp roles routes', () => {
  const SECRET = 'test-secret';
  let app;
  let client;
  let guild;
  let member;

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', SECRET);
    vi.clearAllMocks();

    member = {
      user: { tag: 'Member#0001' },
      roles: {
        add: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    };

    guild = {
      members: {
        fetch: vi.fn().mockResolvedValue(member),
      },
      roles: {
        fetch: vi.fn().mockResolvedValue({ id: 'role1', name: 'Trusted' }),
      },
    };

    client = {
      guilds: {
        cache: new Map([['guild1', guild]]),
        fetch: vi.fn().mockResolvedValue(guild),
      },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };

    app = createApp(client, { query: vi.fn() });
  });

  afterEach(() => {
    _resetSecretCache();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/temp-roles', () => {
    it('returns 400 when guildId is missing', async () => {
      const res = await request(app).get('/api/v1/temp-roles').set('x-api-secret', SECRET);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('guildId is required');
    });

    it('returns paginated temp role data', async () => {
      listTempRoles.mockResolvedValueOnce({
        rows: [{ id: 1, user_id: 'user1', role_id: 'role1' }],
        total: 1,
      });

      const res = await request(app)
        .get('/api/v1/temp-roles?guildId=guild1&userId=user1&page=2&limit=10')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(listTempRoles).toHaveBeenCalledWith('guild1', {
        userId: 'user1',
        limit: 10,
        offset: 10,
      });
      expect(res.body.pagination).toEqual({
        page: 2,
        limit: 10,
        total: 1,
        pages: 1,
      });
    });

    it('returns 500 when listing fails', async () => {
      listTempRoles.mockRejectedValueOnce(new Error('db down'));

      const res = await request(app)
        .get('/api/v1/temp-roles?guildId=guild1')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to fetch temp roles');
    });
  });

  describe('DELETE /api/v1/temp-roles/:id', () => {
    it('returns 400 for missing guildId', async () => {
      const res = await request(app).delete('/api/v1/temp-roles/1').set('x-api-secret', SECRET);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('guildId is required');
    });

    it('returns 400 for invalid id', async () => {
      const res = await request(app)
        .delete('/api/v1/temp-roles/not-a-number?guildId=guild1')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid id');
    });

    it('returns 404 when temp role is missing', async () => {
      revokeTempRoleById.mockResolvedValueOnce(null);

      const res = await request(app)
        .delete('/api/v1/temp-roles/12?guildId=guild1')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('revokes temp role and removes role from member when present', async () => {
      revokeTempRoleById.mockResolvedValueOnce({
        id: 2,
        user_id: 'user1',
        role_id: 'role1',
      });

      const res = await request(app)
        .delete('/api/v1/temp-roles/2?guildId=guild1')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(client.guilds.fetch).toHaveBeenCalledWith('guild1');
      expect(guild.members.fetch).toHaveBeenCalledWith('user1');
      expect(member.roles.remove).toHaveBeenCalledWith('role1', 'Temp role revoked via dashboard');
    });

    it('still succeeds when member lookup fails', async () => {
      revokeTempRoleById.mockResolvedValueOnce({
        id: 2,
        user_id: 'user1',
        role_id: 'role1',
      });
      guild.members.fetch.mockRejectedValueOnce(new Error('missing member'));

      const res = await request(app)
        .delete('/api/v1/temp-roles/2?guildId=guild1')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('returns 500 when revoke operation fails', async () => {
      revokeTempRoleById.mockRejectedValueOnce(new Error('db down'));

      const res = await request(app)
        .delete('/api/v1/temp-roles/2?guildId=guild1')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to revoke temp role');
    });
  });

  describe('POST /api/v1/temp-roles', () => {
    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/v1/temp-roles')
        .set('x-api-secret', SECRET)
        .send({ guildId: 'guild1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });

    it('returns 400 for invalid duration input', async () => {
      const res = await request(app).post('/api/v1/temp-roles').set('x-api-secret', SECRET).send({
        guildId: 'guild1',
        userId: 'user1',
        roleId: 'role1',
        duration: 'not-a-duration',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid duration');
    });

    it('returns 503 when discord client is unavailable', async () => {
      const appWithoutClient = createApp(null, { query: vi.fn() });

      const res = await request(appWithoutClient)
        .post('/api/v1/temp-roles')
        .set('x-api-secret', SECRET)
        .send({
          guildId: 'guild1',
          userId: 'user1',
          roleId: 'role1',
          duration: '1h',
        });

      expect(res.status).toBe(503);
      expect(res.body.error).toContain('Discord client not available');
    });

    it('returns 400 when guild/member/role lookup fails', async () => {
      client.guilds.fetch.mockRejectedValueOnce(new Error('bad guild'));

      const res = await request(app).post('/api/v1/temp-roles').set('x-api-secret', SECRET).send({
        guildId: 'guild1',
        userId: 'user1',
        roleId: 'role1',
        duration: '1h',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid guild, user, or role');
    });

    it('returns 400 when role does not exist', async () => {
      guild.roles.fetch.mockResolvedValueOnce(null);

      const res = await request(app).post('/api/v1/temp-roles').set('x-api-secret', SECRET).send({
        guildId: 'guild1',
        userId: 'user1',
        roleId: 'role1',
        duration: '1h',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Role not found');
    });

    it('assigns role and stores temp-role record', async () => {
      assignTempRole.mockResolvedValueOnce({ id: 99, role_id: 'role1', user_id: 'user1' });

      const res = await request(app).post('/api/v1/temp-roles').set('x-api-secret', SECRET).send({
        guildId: 'guild1',
        userId: 'user1',
        roleId: 'role1',
        duration: '1h',
        reason: 'coverage',
      });

      expect(res.status).toBe(201);
      expect(member.roles.add).toHaveBeenCalledWith('role1', 'coverage');
      expect(assignTempRole).toHaveBeenCalledWith(
        expect.objectContaining({
          guildId: 'guild1',
          userId: 'user1',
          roleId: 'role1',
          roleName: 'Trusted',
          reason: 'coverage',
        }),
      );
    });

    it('returns 500 when assignTempRole throws', async () => {
      assignTempRole.mockRejectedValueOnce(new Error('insert failed'));

      const res = await request(app).post('/api/v1/temp-roles').set('x-api-secret', SECRET).send({
        guildId: 'guild1',
        userId: 'user1',
        roleId: 'role1',
        duration: '1h',
      });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to assign temp role');
    });
  });
});
