import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
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
      message: 'Welcome {{user}} to {{server}}! Member #{{memberCount}}.',
      variants: ['Hey {{user}}!', 'Hello {{user}}!'],
      channels: [
        {
          channelId: 'ch-specific',
          message: 'Special channel welcome, {{user}}!',
          variants: ['Ch variant {{user}}'],
        },
      ],
    },
  }),
}));

vi.mock('../../../src/modules/welcomePublishing.js', () => ({
  WELCOME_PANEL_TYPES: new Set(['rules', 'role_menu']),
  getWelcomePublicationStatus: vi.fn().mockResolvedValue({
    guildId: 'guild1',
    panels: {
      rules: { panelType: 'rules', status: 'missing', configured: true },
      role_menu: { panelType: 'role_menu', status: 'missing', configured: false },
    },
  }),
  publishWelcomePanel: vi.fn().mockResolvedValue({
    panelType: 'rules',
    status: 'posted',
    channelId: 'rules-channel',
  }),
  publishWelcomePanels: vi.fn().mockResolvedValue({
    guildId: 'guild1',
    results: [{ panelType: 'rules', status: 'posted', channelId: 'rules-channel' }],
  }),
}));

import { _resetSecretCache } from '../../../src/api/middleware/verifyJwt.js';
import { createApp } from '../../../src/api/server.js';
import { sessionStore } from '../../../src/api/utils/sessionStore.js';
import {
  getWelcomePublicationStatus,
  publishWelcomePanel,
  publishWelcomePanels,
} from '../../../src/modules/welcomePublishing.js';

describe('welcome routes', () => {
  let app;
  let secret;
  let sessionSigningFixture;

  beforeEach(() => {
    secret = randomBytes(32).toString('hex');
    sessionSigningFixture = randomBytes(32).toString('hex');
    vi.stubEnv('BOT_API_SECRET', secret);
    const client = {
      guilds: { cache: new Map([['guild1', { id: 'guild1' }]]) },
      ws: { status: 0, ping: 42 },
      user: { tag: 'Bot#1234' },
    };
    app = createApp(client, null);
  });

  afterEach(() => {
    sessionStore.clear();
    _resetSecretCache();
    vi.unstubAllEnvs();
  });

  describe('POST /api/v1/guilds/:id/welcome/preview', () => {
    it('renders a template provided in the body', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', secret)
        .send({
          template: 'Hello {{user}} in {{server}}!',
          guild: { name: 'Test Guild', memberCount: 5 },
        });

      expect(res.status).toBe(200);
      expect(res.body.rendered).toBe('Hello <@123456789> in Test Guild!');
      expect(res.body.template).toBe('Hello {{user}} in {{server}}!');
    });

    it('renders from variants when provided in body', async () => {
      const variants = ['Variant A {{user}}', 'Variant B {{user}}'];
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', secret)
        .send({ variants });

      expect(res.status).toBe(200);
      expect(['Variant A <@123456789>', 'Variant B <@123456789>']).toContain(res.body.rendered);
    });

    it('leaves single-brace placeholders as plain text', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', secret)
        .send({
          template: 'Hello {user} in {server}!',
          guild: { name: 'Test Guild', memberCount: 5 },
        });

      expect(res.status).toBe(200);
      expect(res.body.rendered).toBe('Hello {user} in {server}!');
      expect(res.body.template).toBe('Hello {user} in {server}!');
    });

    it('resolves per-channel config when channelId provided', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', secret)
        .send({ channelId: 'ch-specific' });

      expect(res.status).toBe(200);
      // Only one variant in ch-specific
      expect(res.body.rendered).toBe('Ch variant <@123456789>');
    });

    it('falls back to global config when no body overrides', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', secret)
        .send({});

      expect(res.status).toBe(200);
      // Global variants: Hey or Hello
      expect(['Hey <@123456789>!', 'Hello <@123456789>!']).toContain(res.body.rendered);
    });

    it('uses provided member data', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/preview')
        .set('x-api-secret', secret)
        .send({
          template: '{{username}} joined!',
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
        .set('x-api-secret', secret);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.variables)).toBe(true);

      const varNames = res.body.variables.map((v) => v.variable);
      expect(varNames).toContain('{{user}}');
      expect(varNames).toContain('{{username}}');
      expect(varNames).toContain('{{server}}');
      expect(varNames).toContain('{{memberCount}}');
      expect(varNames).toContain('{{greeting}}');
      expect(varNames).toContain('{{vibeLine}}');
      expect(varNames).toContain('{{ctaLine}}');
    });

    it('each variable entry has description', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/welcome/variables')
        .set('x-api-secret', secret);

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

  describe('welcome publishing routes', () => {
    it('returns publication status', async () => {
      const res = await request(app)
        .get('/api/v1/guilds/guild1/welcome/status')
        .set('x-api-secret', secret);

      expect(res.status).toBe(200);
      expect(res.body.panels.rules.status).toBe('missing');
      expect(getWelcomePublicationStatus).toHaveBeenCalledWith('guild1');
    });

    it('publishes all panels', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/publish')
        .set('x-api-secret', secret);

      expect(res.status).toBe(200);
      expect(res.body.results[0].status).toBe('posted');
      expect(publishWelcomePanels).toHaveBeenCalled();
    });

    it('publishes a single panel', async () => {
      const res = await request(app)
        .post('/api/v1/guilds/guild1/welcome/publish/rules')
        .set('x-api-secret', secret);

      expect(res.status).toBe(200);
      expect(res.body.panelType).toBe('rules');
      expect(publishWelcomePanel).toHaveBeenCalledWith(
        expect.anything(),
        'guild1',
        'rules',
        expect.objectContaining({ source: 'dashboard' }),
      );
    });

    it('rate limits welcome publication endpoints for OAuth requests', async () => {
      const userId = '123456789012345678';
      const jti = 'welcome-rate-limit-test';
      vi.stubEnv('SESSION_SECRET', sessionSigningFixture);
      vi.stubEnv('BOT_OWNER_IDS', userId);
      _resetSecretCache();
      sessionStore.set(userId, { accessToken: 'oauth-session-fixture', jti });
      const bearer = jwt.sign({ userId, jti }, sessionSigningFixture);

      let res;
      for (let i = 0; i < 31; i++) {
        res = await request(app)
          .get('/api/v1/guilds/guild1/welcome/status')
          .set('Authorization', `Bearer ${bearer}`);
      }

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too many requests, please try again later');
      expect(res.headers['x-ratelimit-limit']).toBe('30');
    });
  });
});
