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
 * GET /api/guilds/:guildId/members — Proxy enriched member list to bot API.
 * Forwards query params (limit, after, search, sort, order).
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
