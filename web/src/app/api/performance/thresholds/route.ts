import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { buildUpstreamUrl, getBotApiConfig, proxyToBotApi } from '@/lib/bot-api-proxy';
import { getRequestGlobalAdminAuth } from '@/lib/global-admin';

export const dynamic = 'force-dynamic';

async function authorize(request: NextRequest) {
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
  const authError = await authorize(request);
  if (authError) return authError;

  const config = getBotApiConfig('[api/performance/thresholds]');
  if (config instanceof NextResponse) return config;

  const upstreamUrl = buildUpstreamUrl(
    config.baseUrl,
    '/performance/thresholds',
    '[api/performance/thresholds]',
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(
    upstreamUrl,
    config.secret,
    '[api/performance/thresholds]',
    'Failed to fetch thresholds',
  );
}

export async function PUT(request: NextRequest) {
  const authError = await authorize(request);
  if (authError) return authError;

  const config = getBotApiConfig('[api/performance/thresholds]');
  if (config instanceof NextResponse) return config;

  const upstreamUrl = buildUpstreamUrl(
    config.baseUrl,
    '/performance/thresholds',
    '[api/performance/thresholds]',
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  return proxyToBotApi(
    upstreamUrl,
    config.secret,
    '[api/performance/thresholds]',
    'Failed to update thresholds',
    { method: 'PUT', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
  );
}
