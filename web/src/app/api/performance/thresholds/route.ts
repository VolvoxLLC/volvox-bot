import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { proxyBotApiEndpoint } from '@/lib/bot-api-proxy';
import { authorizeRequestGlobalAdmin } from '@/lib/global-admin';

export const dynamic = 'force-dynamic';

const THRESHOLDS_PATH = '/performance/thresholds';
const THRESHOLDS_LOG_PREFIX = '[api/performance/thresholds]';

export async function GET(request: NextRequest) {
  const authError = await authorizeRequestGlobalAdmin(request);
  if (authError) return authError;

  return proxyBotApiEndpoint(THRESHOLDS_PATH, THRESHOLDS_LOG_PREFIX, 'Failed to fetch thresholds');
}

export async function PUT(request: NextRequest) {
  const authError = await authorizeRequestGlobalAdmin(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  return proxyBotApiEndpoint(
    THRESHOLDS_PATH,
    THRESHOLDS_LOG_PREFIX,
    'Failed to update thresholds',
    {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
