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
  { params }: { params: Promise<{ guildId: string; conversationId: string }> },
) {
  const { guildId, conversationId } = await params;
  if (!guildId || !conversationId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, '[api/guilds/:guildId/conversations/:id]');
  if (authError) return authError;

  const config = getBotApiConfig('[api/guilds/:guildId/conversations/:id]');
  if (config instanceof NextResponse) return config;

  const upstreamUrl = buildUpstreamUrl(
    config.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/conversations/${encodeURIComponent(conversationId)}`,
    '[api/guilds/:guildId/conversations/:id]',
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(
    upstreamUrl,
    config.secret,
    '[api/guilds/:guildId/conversations/:id]',
    'Failed to fetch conversation detail',
  );
}
