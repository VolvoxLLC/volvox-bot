import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/moderation/stats]';

/**
 * GET /api/moderation/stats
 * Proxies to bot API GET /api/v1/moderation/stats
 * Requires guildId query param and admin authorization.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guildId = request.nextUrl.searchParams.get('guildId');
  if (!guildId) {
    return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const config = getBotApiConfig(LOG_PREFIX);
  if (config instanceof NextResponse) return config;

  const upstream = buildUpstreamUrl(config.baseUrl, '/moderation/stats', LOG_PREFIX);
  if (upstream instanceof NextResponse) return upstream;

  upstream.searchParams.set('guildId', guildId);

  return proxyToBotApi(upstream, config.secret, LOG_PREFIX, 'Failed to fetch mod stats');
}
