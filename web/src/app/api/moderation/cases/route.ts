import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/moderation/cases]';
const ALLOWED_PARAMS = ['guildId', 'targetId', 'action', 'page', 'limit'];

/**
 * GET /api/moderation/cases
 * Proxies to bot API GET /api/v1/moderation/cases
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

  const upstream = buildUpstreamUrl(config.baseUrl, '/moderation/cases', LOG_PREFIX);
  if (upstream instanceof NextResponse) return upstream;

  for (const key of ALLOWED_PARAMS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) upstream.searchParams.set(key, value);
  }

  return proxyToBotApi(upstream, config.secret, LOG_PREFIX, 'Failed to fetch mod cases');
}
