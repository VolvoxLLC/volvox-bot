import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    welcome: {
      enabled: true,
      channelId: 'ch-main',
      message: 'Welcome {user} to {server}! Member #{memberCount}.',
      variants: ['Hey {user}!', 'Hello {user}!'],
      channels: [
        {
          channelId: 'ch-specific',
          message: 'Special channel welcome, {user}!',
          variants: ['Ch variant {user}'],
        },
      ],
    },
  }),
}));

import { createApp } from '../../../src/api/server.js';

describe('welcome routes', () => {
  let app;
  const SECRET = 'test-secret';

  beforeEach(() => {
    vi.stubEnv('BOT_API_SECRET', SECRET);
    const client = {
      guilds: { cache: new Map() },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };
    app = createApp(client, null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('POST /api/v1/guilds/:id/welcome/preview', () => {
    it('renders a template provided in the body', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', SECRET)
        .send({
          template: 'Hello {user} in {guild}!',
          guild: { name: 'Test Guild', memberCount: 5 },
        });

      expect(res.status).toBe(200);
      expect(res.body.rendered).toBe('Hello <@123456789> in Test Guild!');
      expect(res.body.template).toBe('Hello {user} in {guild}!');
    });

    it('renders using {count} alias', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', SECRET)
        .send({ template: 'Member #{count}', guild: { memberCount: 77 } });

      expect(res.status).toBe(200);
      expect(res.body.rendered).toBe('Member #77');
    });

    it('renders from variants when provided in body', async () => {
      const variants = ['Variant A {user}', 'Variant B {user}'];
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', SECRET)
        .send({ variants });

      expect(res.status).toBe(200);
      expect(['Variant A <@123456789>', 'Variant B <@123456789>']).toContain(res.body.rendered);
    });

    it('resolves per-channel config when channelId provided', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', SECRET)
        .send({ channelId: 'ch-specific' });

      expect(res.status).toBe(200);
      // Only one variant in ch-specific
      expect(res.body.rendered).toBe('Ch variant <@123456789>');
    });

    it('falls back to global config when no body overrides', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', SECRET)
        .send({});

      expect(res.status).toBe(200);
      // Global variants: Hey or Hello
      expect(['Hey <@123456789>!', 'Hello <@123456789>!']).toContain(res.body.rendered);
    });

    it('uses provided member data', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', SECRET)
        .send({
          template: '{username} joined!',
          member: { id: '999', username: 'alice' },
        });

      expect(res.status).toBe(200);
      expect(res.body.rendered).toBe('alice joined!');
    });

    it('returns 401 without auth', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .send({ template: 'Hi {user}!' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/guilds/:id/welcome/variables', () => {
    it('returns supported variable list', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/welcome/variables')
        .set('x-api-secret', SECRET);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.variables)).toBe(true);

      const varNames = res.body.variables.map((v) => v.variable);
      expect(varNames).toContain('{user}');
      expect(varNames).toContain('{username}');
      expect(varNames).toContain('{guild}');
      expect(varNames).toContain('{server}');
      expect(varNames).toContain('{count}');
      expect(varNames).toContain('{memberCount}');
    });

    it('each variable entry has description', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/welcome/variables')
        .set('x-api-secret', SECRET);

      for (const v of res.body.variables) {
        expect(typeof v.variable).toBe('string');
        expect(typeof v.description).toBe('string');
        expect(v.description.length).toBeGreaterThan(0);
      }
    });

    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/v1/guilds/guild1/welcome/variables');
      expect(res.status).toBe(401);
    });
  });
});
