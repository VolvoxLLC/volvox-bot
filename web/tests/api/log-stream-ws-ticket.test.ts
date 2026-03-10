import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockAuthorizeGuildAdmin } = vi.hoisted(() => ({
  mockAuthorizeGuildAdmin: vi.fn(),
}));

vi.mock('@/lib/bot-api-proxy', () => ({
  authorizeGuildAdmin: mockAuthorizeGuildAdmin,
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
    mockAuthorizeGuildAdmin.mockResolvedValue(null);
  });

  it('returns 400 when guildId is missing', async () => {
    const response = await GET(createRequest('http://localhost:3000/api/log-stream/ws-ticket'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing guildId' });
    expect(mockAuthorizeGuildAdmin).not.toHaveBeenCalled();
  });

  it('returns auth error when requester is not authorized', async () => {
    mockAuthorizeGuildAdmin.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns ws url and ticket for authorized guild admins', async () => {
    const response = await GET(createRequest());

    expect(mockAuthorizeGuildAdmin).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'guild-1',
      '[api/logs/ws-ticket]',
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as { wsUrl: string; ticket: string };
    expect(body.wsUrl).toBe('wss://bot.internal:3001/ws/logs');
    expect(body.ticket.split('.')).toHaveLength(3);
  });
});
