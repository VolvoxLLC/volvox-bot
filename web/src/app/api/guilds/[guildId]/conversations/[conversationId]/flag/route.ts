import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

const LOG_PREFIX = '[api/guilds/:guildId/conversations/:id/flag]';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; conversationId: string }> },
) {
  const { guildId, conversationId } = await params;
  if (!guildId || !conversationId) {
    return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const config = getBotApiConfig(LOG_PREFIX);
  if (config instanceof NextResponse) return config;

  const upstreamUrl = buildUpstreamUrl(
    config.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/conversations/${encodeURIComponent(conversationId)}/flag`,
    LOG_PREFIX,
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  let body: string;
  try {
    body = JSON.stringify(await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  return proxyToBotApi(upstreamUrl, config.secret, LOG_PREFIX, 'Failed to flag message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
