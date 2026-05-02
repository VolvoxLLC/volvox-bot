import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockAuthorizeRequestGlobalAdmin } = vi.hoisted(() => ({
  mockAuthorizeRequestGlobalAdmin: vi.fn(),
}));

vi.mock('@/lib/global-admin', () => ({
  authorizeRequestGlobalAdmin: mockAuthorizeRequestGlobalAdmin,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

import { GET } from '@/app/api/log-stream/ws-ticket/route';

function createRequest(url = 'http://localhost:3000/api/log-stream/ws-ticket?guildId=guild-1') {
  return new NextRequest(new URL(url));
}

describe('GET /api/log-stream/ws-ticket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BOT_API_URL = 'https://bot.internal:3001';
    process.env.BOT_API_SECRET = 'bot-secret';
    mockAuthorizeRequestGlobalAdmin.mockResolvedValue(null);
  });

  it('returns 400 when guildId is missing', async () => {
    const response = await GET(createRequest('http://localhost:3000/api/log-stream/ws-ticket'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing guildId' });
    expect(mockAuthorizeRequestGlobalAdmin).not.toHaveBeenCalled();
  });

  it('returns 403 when requester is not a global admin', async () => {
    mockAuthorizeRequestGlobalAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const request = createRequest();
    const response = await GET(request);

    expect(mockAuthorizeRequestGlobalAdmin).toHaveBeenCalledWith(request);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns ws url and ticket for authorized global admins', async () => {
    const request = createRequest();
    const response = await GET(request);

    expect(mockAuthorizeRequestGlobalAdmin).toHaveBeenCalledWith(request);
    expect(response.status).toBe(200);

    const body = (await response.json()) as { wsUrl: string; ticket: string };
    expect(body.wsUrl).toBe('wss://bot.internal:3001/ws/logs');
    const ticketParts = body.ticket.split('.');
    expect(ticketParts).toHaveLength(4);
    expect(ticketParts[2]).toBe('guild-1');
  });

  it('returns 500 when bot API config is missing', async () => {
    delete process.env.BOT_API_SECRET;

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Bot API is not configured' });
  });

  it('returns 500 when bot API URL is invalid', async () => {
    process.env.BOT_API_URL = 'not a url';

    const response = await GET(createRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Bot API is not configured correctly',
    });
  });
});
