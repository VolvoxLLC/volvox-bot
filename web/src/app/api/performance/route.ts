import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildUpstreamUrl, getBotApiConfig, proxyToBotApi } from '@/lib/bot-api-proxy';
import { getRequestGlobalAdminAuth } from '@/lib/global-admin';

export const dynamic = 'force-dynamic';

async function authorizeGlobalAdmin(request: NextRequest) {
  const auth = await getRequestGlobalAdminAuth(request);
  if (auth.ok) return null;

  if (auth.reason === 'token-expired') {
    return NextResponse.json({ error: 'Token expired. Please sign in again.' }, { status: 401 });
  }

  if (auth.reason === 'unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const adminError = await authorizeGlobalAdmin(request);
  if (adminError) return adminError;

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
