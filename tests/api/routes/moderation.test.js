import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../src/db.js', () => ({
  getPool: vi.fn(),
}));

// Mock the guilds module to provide requireGuildModerator
vi.mock('../../../src/api/routes/guilds.js', () => ({
  requireGuildModerator: (_req, _res, next) => next(),
}));

import moderationRouter from '../../../src/api/routes/moderation.js';
import { getPool } from '../../../src/db.js';

function buildApp(mockPool) {
  getPool.mockReturnValue(mockPool);
  const app = express();
  app.use(express.json());
  app.use('/moderation', moderationRouter);
  return app;
}

describe('moderation routes', () => {
  const mockPool = {
    query: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /moderation/cases', () => {
    it('should return 400 when guildId is missing', async () => {
      const app = buildApp(mockPool);
      const res = await request(app).get('/moderation/cases');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('guildId is required');
    });

    it('should return paginated cases', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, case_number: 1, action: 'warn' }] })
        .mockResolvedValueOnce({ rows: [{ total: 1 }] });

      const app = buildApp(mockPool);
      const res = await request(app).get('/moderation/cases?guildId=g1');

      expect(res.status).toBe(200);
      expect(res.body.cases).toHaveLength(1);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(1);
    });

    it('should cap limit at 100', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total: 0 }] });

      const app = buildApp(mockPool);
      await request(app).get('/moderation/cases?guildId=g1&limit=999');

      const casesQuery = mockPool.query.mock.calls[0][1];
      expect(casesQuery).toContain(100); // limit capped at 100
    });
  });

  describe('GET /moderation/cases/:caseNumber', () => {
    it('should return 400 for invalid case number', async () => {
      const app = buildApp(mockPool);
      const res = await request(app).get('/moderation/cases/abc?guildId=g1');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid case number');
    });

    it('should return 404 when case not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      const app = buildApp(mockPool);
      const res = await request(app).get('/moderation/cases/1?guildId=g1');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /moderation/stats', () => {
    it('should return 400 when guildId is missing', async () => {
      const app = buildApp(mockPool);
      const res = await request(app).get('/moderation/stats');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('guildId is required');
    });

    it('should return stats summary', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 10 }] })
        .mockResolvedValueOnce({ rows: [{ total: 2 }] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] })
        .mockResolvedValueOnce({ rows: [{ action: 'warn', count: 7 }] })
        .mockResolvedValueOnce({ rows: [] });

      const app = buildApp(mockPool);
      const res = await request(app).get('/moderation/stats?guildId=g1');

      expect(res.status).toBe(200);
      expect(res.body.totalCases).toBe(10);
      expect(res.body.last24h).toBe(2);
      expect(res.body.byAction).toEqual({ warn: 7 });
    });
  });
});
