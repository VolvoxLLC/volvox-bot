import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/utils/logQuery.js', () => ({
  queryLogs: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
}));

vi.mock('../../src/utils/restartTracker.js', () => {
  throw new Error('Module not found');
});

import { createApp } from '../../src/api/server.js';
import { swaggerSpec } from '../../src/api/swagger.js';

describe('OpenAPI / Swagger', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  function buildApp() {
    const client = {
      guilds: { cache: new Map([['guild1', {}]]) },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };
    return createApp(client, null);
  }

  describe('swagger spec validation', () => {
    it('should generate a valid OpenAPI spec with paths', () => {
      expect(swaggerSpec).toBeDefined();
      expect(swaggerSpec.openapi).toBe('3.1.0');
      expect(swaggerSpec.info.title).toBe('Volvox Bot API');
      expect(swaggerSpec.paths).toBeDefined();
      expect(Object.keys(swaggerSpec.paths).length).toBeGreaterThan(0);
    });

    it('should include security schemes', () => {
      expect(swaggerSpec.components.securitySchemes.ApiKeyAuth).toBeDefined();
      expect(swaggerSpec.components.securitySchemes.CookieAuth).toBeDefined();
    });

    it('should include common schemas', () => {
      expect(swaggerSpec.components.schemas.Error).toBeDefined();
      expect(swaggerSpec.components.schemas.ValidationError).toBeDefined();
      expect(swaggerSpec.components.schemas.PaginatedResponse).toBeDefined();
    });

    it('should include rate limit headers', () => {
      expect(swaggerSpec.components.headers['X-RateLimit-Limit']).toBeDefined();
      expect(swaggerSpec.components.headers['X-RateLimit-Remaining']).toBeDefined();
      expect(swaggerSpec.components.headers['X-RateLimit-Reset']).toBeDefined();
    });

    it('should document all major route groups', () => {
      const paths = Object.keys(swaggerSpec.paths);
      expect(paths.some((p) => p.startsWith('/health'))).toBe(true);
      expect(paths.some((p) => p.startsWith('/auth/'))).toBe(true);
      expect(paths.some((p) => p.startsWith('/community/'))).toBe(true);
      expect(paths.some((p) => p.startsWith('/config'))).toBe(true);
      expect(paths.some((p) => p.startsWith('/guilds'))).toBe(true);
      expect(paths.some((p) => p.includes('/conversations'))).toBe(true);
      expect(paths.some((p) => p.includes('/members'))).toBe(true);
      expect(paths.some((p) => p.startsWith('/moderation/'))).toBe(true);
      expect(paths.some((p) => p.includes('/tickets'))).toBe(true);
      expect(paths.some((p) => p.startsWith('/webhooks/'))).toBe(true);
    });
  });

  describe('/api/docs endpoint', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/docs/');
      expect(res.status).toBe(401);
    });

    it('should return 200 for authenticated requests (API secret)', async () => {
      vi.stubEnv('BOT_API_SECRET', 'test-secret-for-swagger');
      const app = buildApp();
      const res = await request(app)
        .get('/api/docs/')
        .set('x-api-secret', 'test-secret-for-swagger');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });
  });

  describe('/api/docs.json endpoint', () => {
    it('should return 401 for unauthenticated requests', async () => {
      const app = buildApp();
      const res = await request(app).get('/api/docs.json');
      expect(res.status).toBe(401);
    });

    it('should return the OpenAPI spec as JSON for authenticated requests', async () => {
      vi.stubEnv('BOT_API_SECRET', 'test-secret-for-swagger');
      const app = buildApp();
      const res = await request(app)
        .get('/api/docs.json')
        .set('x-api-secret', 'test-secret-for-swagger');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.1.0');
      expect(res.body.paths).toBeDefined();
      expect(Object.keys(res.body.paths).length).toBeGreaterThan(0);
    });
  });
});
