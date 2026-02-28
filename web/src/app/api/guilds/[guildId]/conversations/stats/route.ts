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
    '[api/guilds/:guildId/conversations/stats]',
  );
  if (authError) return authError;

  const config = getBotApiConfig('[api/guilds/:guildId/conversations/stats]');
  if (config instanceof NextResponse) return config;

  const upstreamUrl = buildUpstreamUrl(
    config.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/conversations/stats`,
    '[api/guilds/:guildId/conversations/stats]',
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(
    upstreamUrl,
    config.secret,
    '[api/guilds/:guildId/conversations/stats]',
    'Failed to fetch conversation stats',
  );
}
