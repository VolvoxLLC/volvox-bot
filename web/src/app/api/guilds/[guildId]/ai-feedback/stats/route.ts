import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params;
  if (!guildId) {
    return NextResponse.json({ error: 'Missing guildId' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(
    request,
    guildId,
    '[api/guilds/:guildId/ai-feedback/stats]',
  );
  if (authError) return authError;

  const config = getBotApiConfig('[api/guilds/:guildId/ai-feedback/stats]');
  if (config instanceof NextResponse) return config;

  const upstreamUrl = buildUpstreamUrl(
    config.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/ai-feedback/stats`,
    '[api/guilds/:guildId/ai-feedback/stats]',
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  const days = request.nextUrl.searchParams.get('days');
  if (days !== null) {
    upstreamUrl.searchParams.set('days', days);
  }

  return proxyToBotApi(
    upstreamUrl,
    config.secret,
    '[api/guilds/:guildId/ai-feedback/stats]',
    'Failed to fetch AI feedback stats',
  );
}
