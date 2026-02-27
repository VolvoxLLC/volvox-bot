import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { buildUpstreamUrl, getBotApiConfig, proxyToBotApi } from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request });

  if (typeof token?.accessToken !== 'string' || token.accessToken.length === 0) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (token.error === 'RefreshTokenError') {
    return NextResponse.json({ error: 'Token expired. Please sign in again.' }, { status: 401 });
  }

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
