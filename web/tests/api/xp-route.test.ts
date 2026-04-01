import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockAuthorizeGuildModerator,
  mockGetBotApiConfig,
  mockBuildUpstreamUrl,
  mockProxyToBotApi,
  mockGetToken,
} = vi.hoisted(() => ({
  mockAuthorizeGuildModerator: vi.fn(),
  mockGetBotApiConfig: vi.fn(),
  mockBuildUpstreamUrl: vi.fn(),
  mockProxyToBotApi: vi.fn(),
  mockGetToken: vi.fn(),
}));

vi.mock('@/lib/bot-api-proxy', () => ({
  authorizeGuildModerator: (...args: unknown[]) => mockAuthorizeGuildModerator(...args),
  getBotApiConfig: (...args: unknown[]) => mockGetBotApiConfig(...args),
  buildUpstreamUrl: (...args: unknown[]) => mockBuildUpstreamUrl(...args),
  proxyToBotApi: (...args: unknown[]) => mockProxyToBotApi(...args),
}));

vi.mock('next-auth/jwt', () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { POST } from '@/app/api/guilds/[guildId]/members/[userId]/xp/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/guilds/g1/members/u1/xp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeParams(guildId = 'g1', userId = 'u1') {
  return { params: Promise.resolve({ guildId, userId }) };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('POST /api/guilds/:guildId/members/:userId/xp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthorizeGuildModerator.mockResolvedValue(null); // authorized
    mockGetBotApiConfig.mockReturnValue({ baseUrl: 'http://bot:3001', secret: 's3cret' });
    mockBuildUpstreamUrl.mockReturnValue(new URL('http://bot:3001/guilds/g1/members/u1/xp'));
    mockGetToken.mockResolvedValue({ id: 'moderator-1' });
    mockProxyToBotApi.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
  });

  it('rejects amount = 0', async () => {
    const res = await POST(makeRequest({ amount: 0 }), makeParams());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('must not be zero');
  });

  it('rejects amount exceeding positive bound', async () => {
    const res = await POST(makeRequest({ amount: 1_000_001 }), makeParams());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('between');
  });

  it('rejects amount exceeding negative bound', async () => {
    const res = await POST(makeRequest({ amount: -1_000_001 }), makeParams());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('between');
  });

  it('rejects reason longer than 500 characters', async () => {
    const res = await POST(
      makeRequest({ amount: 10, reason: 'x'.repeat(501) }),
      makeParams(),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('500 characters');
  });

  it('accepts valid positive amount', async () => {
    await POST(makeRequest({ amount: 100 }), makeParams());
    expect(mockProxyToBotApi).toHaveBeenCalled();
  });

  it('accepts valid negative amount', async () => {
    await POST(makeRequest({ amount: -50 }), makeParams());
    expect(mockProxyToBotApi).toHaveBeenCalled();
  });

  it('accepts amount at the boundary (1000000)', async () => {
    await POST(makeRequest({ amount: 1_000_000 }), makeParams());
    expect(mockProxyToBotApi).toHaveBeenCalled();
  });

  it('accepts reason at the boundary (500 chars)', async () => {
    await POST(
      makeRequest({ amount: 10, reason: 'x'.repeat(500) }),
      makeParams(),
    );
    expect(mockProxyToBotApi).toHaveBeenCalled();
  });

  it('rejects non-integer amount', async () => {
    const res = await POST(makeRequest({ amount: 1.5 }), makeParams());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('finite integer');
  });

  it('rejects missing amount', async () => {
    const res = await POST(makeRequest({ reason: 'test' }), makeParams());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Missing required field');
  });

  it('rejects non-string reason', async () => {
    const res = await POST(makeRequest({ amount: 10, reason: 123 }), makeParams());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('must be a string');
  });

  it('rejects non-object body', async () => {
    const req = new NextRequest('http://localhost:3000/api/guilds/g1/members/u1/xp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([1, 2, 3]),
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('JSON object');
  });

  it('rejects invalid JSON', async () => {
    const req = new NextRequest('http://localhost:3000/api/guilds/g1/members/u1/xp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Invalid JSON');
  });

  it('returns 400 when guildId or userId is missing', async () => {
    const res = await POST(makeRequest({ amount: 10 }), makeParams('', 'u1'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('Missing guildId or userId');
  });

  it('strips unknown fields from the forwarded body', async () => {
    await POST(makeRequest({ amount: 10, reason: 'ok', extra: 'bad' }), makeParams());
    expect(mockProxyToBotApi).toHaveBeenCalled();
    const call = mockProxyToBotApi.mock.calls[0];
    const forwardedBody = JSON.parse(call[4].body);
    expect(forwardedBody).toEqual({ amount: 10, reason: 'ok' });
    expect(forwardedBody).not.toHaveProperty('extra');
  });

  it('forwards the authenticated moderator id to the bot api', async () => {
    await POST(makeRequest({ amount: 10 }), makeParams());

    expect(mockProxyToBotApi).toHaveBeenCalled();
    expect(mockProxyToBotApi.mock.calls[0][4].headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-discord-user-id': 'moderator-1',
    });
  });
});
