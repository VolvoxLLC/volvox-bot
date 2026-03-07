import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { buildUpstreamUrl, getBotApiConfig, proxyToBotApi } from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

/**
 * GET /api/performance — bot-wide performance data (not guild-scoped).
 * Any authenticated user (dashboard "viewer" for Performance = any logged-in user) can access.
 */
export async function GET(request: NextRequest) {
  const token = await getToken({ req: request });

  if (typeof token?.accessToken !== 'string' || token.accessToken.length === 0) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (token.error === 'RefreshTokenError') {
    return NextResponse.json({ error: 'Token expired. Please sign in again.' }, { status: 401 });
  }

  const config = getBotApiConfig('[api/performance]');
  if (config instanceof NextResponse) return config;

  const upstreamUrl = buildUpstreamUrl(config.baseUrl, '/performance', '[api/performance]');
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(
    upstreamUrl,
    config.secret,
    '[api/performance]',
    'Failed to fetch performance data',
  );
}
