import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/members/:userId/cases]';

/**
 * Proxy a guild member's moderation case history request to the bot API.
 *
 * Validates route parameters, enforces guild-admin authorization, forwards the original query parameters, and returns the upstream bot API response.
 *
 * @returns The NextResponse from the bot API proxy, or an error NextResponse (for example, 400 when `guildId` or `userId` is missing, or an authorization error response).
 */
export async function GET(
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

  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const path = `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/cases${qs ? `?${qs}` : ''}`;

  const upstreamUrl = buildUpstreamUrl(apiConfig.baseUrl, path, LOG_PREFIX);
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(upstreamUrl, apiConfig.secret, LOG_PREFIX, 'Failed to fetch member cases');
}
