import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/welcome/publish/:panelType]';
const PANEL_TYPES = new Set(['rules', 'role_menu']);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; panelType: string }> },
) {
  const { guildId, panelType } = await params;
  if (!guildId) {
    return NextResponse.json({ error: 'Missing guildId' }, { status: 400 });
  }
  if (!PANEL_TYPES.has(panelType)) {
    return NextResponse.json({ error: 'Invalid welcome panel type' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const apiConfig = getBotApiConfig(LOG_PREFIX);
  if (apiConfig instanceof NextResponse) return apiConfig;

  const upstreamUrl = buildUpstreamUrl(
    apiConfig.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/welcome/publish/${encodeURIComponent(panelType)}`,
    LOG_PREFIX,
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(
    upstreamUrl,
    apiConfig.secret,
    LOG_PREFIX,
    'Failed to publish welcome panel',
    { method: 'POST' },
  );
}
