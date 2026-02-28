import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/members]';

/**
 * Proxy guild member list requests to the bot API, enriching and forwarding query parameters.
 *
 * Validates presence of `guildId` and that the requester is a guild admin, forwards `limit`, `after`, `search`, `sort`, and `order` query parameters to the upstream `/guilds/{guildId}/members` path, and proxies the response from the bot API.
 *
 * @returns A NextResponse from the proxy call or an error NextResponse (e.g., 400 when `guildId` is missing, an authorization error response, or an upstream configuration/resolution error).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params;
  if (!guildId) {
    return NextResponse.json({ error: 'Missing guildId' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const apiConfig = getBotApiConfig(LOG_PREFIX);
  if (apiConfig instanceof NextResponse) return apiConfig;

  // Forward query string to upstream
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const path = `/guilds/${encodeURIComponent(guildId)}/members${qs ? `?${qs}` : ''}`;

  const upstreamUrl = buildUpstreamUrl(apiConfig.baseUrl, path, LOG_PREFIX);
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(upstreamUrl, apiConfig.secret, LOG_PREFIX, 'Failed to fetch members');
}
