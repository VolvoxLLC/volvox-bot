import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
} from '@/lib/bot-api-proxy';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/members/export]';
const REQUEST_TIMEOUT_MS = 30_000; // CSV can take longer for large guilds

/**
 * GET /api/guilds/:guildId/members/export — Proxy CSV export, streaming the response.
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

  const upstreamUrl = buildUpstreamUrl(
    apiConfig.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/members/export`,
    LOG_PREFIX,
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  try {
    const response = await fetch(upstreamUrl.toString(), {
      headers: { 'x-api-secret': apiConfig.secret },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return NextResponse.json(
        { error: text || 'Failed to export members' },
        { status: response.status },
      );
    }

    // Stream the CSV body through
    return new NextResponse(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': response.headers.get('Content-Disposition') || 'attachment; filename="members.csv"',
      },
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') {
      logger.error(`${LOG_PREFIX} Export timed out`);
      return NextResponse.json({ error: 'Export timed out' }, { status: 504 });
    }
    logger.error(`${LOG_PREFIX} Failed to export members:`, error);
    return NextResponse.json({ error: 'Failed to export members' }, { status: 500 });
  }
}
