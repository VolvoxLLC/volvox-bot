import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/members/:userId]';

/**
 * Proxy a GET request for a guild member's details to the bot API.
 *
 * Validates required path parameters, enforces guild admin authorization, builds the upstream URL,
 * and forwards the request to the bot API. Returns a 400 response if `guildId` or `userId` is missing,
 * returns any authorization or configuration error responses produced during processing, and otherwise
 * returns the proxied bot API response (or an error response if proxying fails).
 *
 * @param params - Promise resolving to an object with `guildId` and `userId` path parameters
 * @returns A NextResponse containing the proxied bot API response or an error response
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

  const upstreamUrl = buildUpstreamUrl(
    apiConfig.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`,
    LOG_PREFIX,
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(upstreamUrl, apiConfig.secret, LOG_PREFIX, 'Failed to fetch member details');
}
