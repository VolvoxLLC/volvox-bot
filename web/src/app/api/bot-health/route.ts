import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get('guildId');
  if (!guildId) {
    return NextResponse.json({ error: 'Missing guildId' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, '[api/bot-health]');
  if (authError) return authError;

  const config = getBotApiConfig('[api/bot-health]');
  if (config instanceof NextResponse) return config;

  const upstreamUrl = buildUpstreamUrl(config.baseUrl, '/health', '[api/bot-health]');
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(
    upstreamUrl,
    config.secret,
    '[api/bot-health]',
    'Failed to fetch health data',
  );
}
