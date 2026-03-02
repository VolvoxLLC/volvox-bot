import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    ai: { enabled: true, model: 'claude-3' },
    welcome: { enabled: false },
    spam: { enabled: true },
    moderation: { enabled: true },
    triage: { enabled: true, classifyApiKey: 'sk-secret', respondApiKey: 'sk-resp' },
    permissions: { botOwners: ['owner-user-id'] },
  }),
  setConfigValue: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../src/api/utils/configAllowlist.js', () => ({
  SAFE_CONFIG_KEYS: new Set(['ai', 'welcome', 'spam', 'moderation', 'triage']),
  SENSITIVE_FIELDS: new Set(['triage.classifyApiKey', 'triage.respondApiKey']),
  READABLE_CONFIG_KEYS: ['ai', 'welcome', 'spam', 'moderation', 'triage', 'logging'],
  maskSensitiveFields: vi.fn((c) => c),
  stripMaskedWrites: vi.fn((w) => w),
  isMasked: vi.fn(() => false),
  MASK: '••••••••',
}));

vi.mock('../../../src/api/utils/validateWebhookUrl.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, validateDnsResolution: vi.fn().mockResolvedValue(true) };
});

// Mock backup module so tests don't touch the filesystem via default paths
let mockBackups = [];

vi.mock('../../../src/modules/backup.js', () => ({
  exportConfig: vi.fn(() => ({
    config: { ai: { enabled: true } },
    exportedAt: new Date().toISOString(),
    version: 1,
  })),
  importConfig: vi.fn().mockResolvedValue({ applied: ['ai.enabled'], skipped: [], failed: [] }),
  validateImportPayload: vi.fn((p) => {
    if (!p || typeof p !== 'object' || !('config' in p))
      return ['Import payload must have a "config" key'];
    return [];
  }),
  listBackups: vi.fn(() => mockBackups),
  createBackup: vi.fn(() => ({
    id: 'backup-2026-03-01T12-00-00',
    size: 1024,
    createdAt: new Date().toISOString(),
  })),
  readBackup: vi.fn((id) => {
    if (id === 'not-found') throw new Error('Backup not found: not-found');
    if (id === 'bad-id-traversal') throw new Error('Invalid backup ID');
    return { config: { ai: { enabled: true } }, exportedAt: new Date().toISOString(), version: 1 };
  }),
  restoreBackup: vi.fn().mockResolvedValue({ applied: ['ai.enabled'], skipped: [], failed: [] }),
  pruneBackups: vi.fn(() => ['backup-old-1', 'backup-old-2']),
  startScheduledBackups: vi.fn(),
  stopScheduledBackups: vi.fn(),
  sanitizeConfig: vi.fn((c) => c),
  getBackupDir: vi.fn(() => '/tmp/mock-backups'),
}));

import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import { createApp } from '../../../src/api/server.js';
import { guildCache } from '../../../src/api/utils/discordApi.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';

describe('backup routes', () => {
  let app;
  const SECRET = 'test-backup-secret';

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', SECRET);
    mockBackups = [];

    const client = {
      guilds: { cache: new Map() },
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

  function createOwnerToken(secret = 'jwt-test-secret', userId = 'owner-user-id') {
    sessionStore.set(userId, 'discord-access-token');
    return jwt.sign({ userId, username: 'owner' }, secret, { algorithm: 'HS256' });
  }

  function createNonOwnerToken(secret = 'jwt-test-secret', userId = 'normal-user') {
    sessionStore.set(userId, 'discord-access-token');
    return jwt.sign({ userId, username: 'nobody' }, secret, { algorithm: 'HS256' });
  }

  // --- Auth checks ---

  describe('auth', () => {
    it('rejects unauthenticated requests', async () => {
      const res = await request(app).get('/api/v1/backups');
      expect(res.status).toBe(401);
    });

    it('rejects non-owner OAuth users', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createNonOwnerToken();
      const res = await request(app).get('/api/v1/backups').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('allows api-secret', async () => {
      const res = await request(app).get('/api/v1/backups').set('x-api-secret', SECRET);
      expect(res.status).toBe(200);
    });

    it('allows bot-owner OAuth', async () => {
      vi.stubEnv('SESSION_SECRET', 'jwt-test-secret');
      const token = createOwnerToken();
      const res = await request(app).get('/api/v1/backups').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  // --- GET /backups ---

  describe('GET /backups', () => {
    it('returns empty array when no backups', async () => {
      const res = await request(app).get('/api/v1/backups').set('x-api-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns list of backups', async () => {
      mockBackups = [
        {
          id: 'backup-2026-03-01T12-00-00',
          filename: 'backup-2026-03-01T12-00-00.json',
          createdAt: '2026-03-01T12:00:00Z',
          size: 512,
        },
      ];
      const res = await request(app).get('/api/v1/backups').set('x-api-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].id).toBe('backup-2026-03-01T12-00-00');
    });
  });

  // --- POST /backups ---

  describe('POST /backups', () => {
    it('creates a backup and returns 201', async () => {
      const res = await request(app).post('/api/v1/backups').set('x-api-secret', SECRET);
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('backup-2026-03-01T12-00-00');
      expect(res.body.size).toBe(1024);
    });

    it('returns 500 on backup creation failure', async () => {
      const { createBackup } = await import('../../../src/modules/backup.js');
      createBackup.mockImplementationOnce(() => {
        throw new Error('disk full');
      });

      const res = await request(app).post('/api/v1/backups').set('x-api-secret', SECRET);
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('Failed to create backup');
    });
  });

  // --- GET /backups/export ---

  describe('GET /backups/export', () => {
    it('returns config JSON with content-disposition attachment', async () => {
      const res = await request(app).get('/api/v1/backups/export').set('x-api-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.body).toHaveProperty('config');
      expect(res.body).toHaveProperty('exportedAt');
      expect(res.body.version).toBe(1);
    });
  });

  // --- POST /backups/import ---

  describe('POST /backups/import', () => {
    it('imports a valid payload', async () => {
      const res = await request(app)
        .post('/api/v1/backups/import')
        .set('x-api-secret', SECRET)
        .send({ config: { ai: { enabled: false } } });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('applied');
    });

    it('rejects invalid payload', async () => {
      const { validateImportPayload } = await import('../../../src/modules/backup.js');
      validateImportPayload.mockReturnValueOnce(['Import payload must have a "config" key']);

      const res = await request(app)
        .post('/api/v1/backups/import')
        .set('x-api-secret', SECRET)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid import payload');
    });
  });

  // --- GET /backups/:id/download ---

  describe('GET /backups/:id/download', () => {
    it('downloads a specific backup', async () => {
      const res = await request(app)
        .get('/api/v1/backups/backup-2026-03-01T12-00-00/download')
        .set('x-api-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/attachment/);
      expect(res.body).toHaveProperty('config');
    });

    it('returns 404 for unknown backup', async () => {
      const res = await request(app)
        .get('/api/v1/backups/not-found/download')
        .set('x-api-secret', SECRET);
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid (path-traversal) backup id', async () => {
      const { readBackup } = await import('../../../src/modules/backup.js');
      readBackup.mockImplementationOnce(() => {
        throw new Error('Invalid backup ID');
      });
      const res = await request(app)
        .get('/api/v1/backups/bad-id-traversal/download')
        .set('x-api-secret', SECRET);
      expect(res.status).toBe(400);
    });
  });

  // --- POST /backups/:id/restore ---

  describe('POST /backups/:id/restore', () => {
    it('restores from a valid backup', async () => {
      const res = await request(app)
        .post('/api/v1/backups/backup-2026-03-01T12-00-00/restore')
        .set('x-api-secret', SECRET);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('applied');
    });

    it('returns 404 for unknown backup', async () => {
      const { restoreBackup } = await import('../../../src/modules/backup.js');
      restoreBackup.mockRejectedValueOnce(new Error('Backup not found: not-found'));
      const res = await request(app)
        .post('/api/v1/backups/not-found/restore')
        .set('x-api-secret', SECRET);
      expect(res.status).toBe(404);
    });
  });

  // --- POST /backups/prune ---

  describe('POST /backups/prune', () => {
    it('prunes with default retention', async () => {
      const res = await request(app)
        .post('/api/v1/backups/prune')
        .set('x-api-secret', SECRET)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.deleted).toEqual(['backup-old-1', 'backup-old-2']);
      expect(res.body.count).toBe(2);
    });

    it('prunes with custom retention', async () => {
      const { pruneBackups } = await import('../../../src/modules/backup.js');
      pruneBackups.mockReturnValueOnce([]);
      const res = await request(app)
        .post('/api/v1/backups/prune')
        .set('x-api-secret', SECRET)
        .send({ daily: 10, weekly: 8 });
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });
  });
});
