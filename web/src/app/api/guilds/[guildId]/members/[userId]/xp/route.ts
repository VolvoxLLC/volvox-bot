import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/members/:userId/xp]';

/**
 * POST /api/guilds/:guildId/members/:userId/xp — Proxy XP adjustment to bot API.
 * Body: { amount: number, reason?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; userId: string }> },
) {
  const { guildId, userId } = await params;
  if (!guildId || !userId) {
    return NextResponse.json({ error: 'Missing guildId or userId' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const apiConfig = getBotApiConfig(LOG_PREFIX);
  if (apiConfig instanceof NextResponse) return apiConfig;

  let body: string;
  try {
    const json = await request.json();
    body = JSON.stringify(json);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const upstreamUrl = buildUpstreamUrl(
    apiConfig.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/xp`,
    LOG_PREFIX,
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(upstreamUrl, apiConfig.secret, LOG_PREFIX, 'Failed to adjust XP', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
