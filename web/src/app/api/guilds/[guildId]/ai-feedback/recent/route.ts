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
    '[api/guilds/:guildId/ai-feedback/recent]',
  );
  if (authError) return authError;

  const config = getBotApiConfig('[api/guilds/:guildId/ai-feedback/recent]');
  if (config instanceof NextResponse) return config;

  const upstreamUrl = buildUpstreamUrl(
    config.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/ai-feedback/recent`,
    '[api/guilds/:guildId/ai-feedback/recent]',
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  const limit = request.nextUrl.searchParams.get('limit');
  if (limit !== null) {
    upstreamUrl.searchParams.set('limit', limit);
  }

  return proxyToBotApi(
    upstreamUrl,
    config.secret,
    '[api/guilds/:guildId/ai-feedback/recent]',
    'Failed to fetch recent AI feedback',
  );
}
