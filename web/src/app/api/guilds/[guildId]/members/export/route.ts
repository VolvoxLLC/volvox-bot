import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeGuildAdmin, buildUpstreamUrl, getBotApiConfig } from '@/lib/bot-api-proxy';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/members/export]';
const REQUEST_TIMEOUT_MS = 30_000; // CSV can take longer for large guilds

/**
 * Proxy the guild members CSV export from the bot API and stream the resulting CSV back to the client.
 *
 * Validates the route parameter, enforces guild-admin authorization, forwards the upstream export request with a timeout, and returns the upstream CSV body with appropriate `Content-Type` and `Content-Disposition`. On failure returns a JSON error response with an appropriate HTTP status (e.g., 400 for missing guildId, the upstream status for upstream errors, 504 for timeouts, or 500 for internal failures).
 *
 * @returns A NextResponse containing the streamed CSV on success; on error a JSON response describing the failure with the corresponding HTTP status.
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
        'Content-Disposition':
          response.headers.get('Content-Disposition') || 'attachment; filename="members.csv"',
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
