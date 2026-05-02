import type { NextRequest } from 'next/server';
import { proxyBotApiEndpoint } from '@/lib/bot-api-proxy';
import { authorizeRequestGlobalAdmin } from '@/lib/global-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const adminError = await authorizeRequestGlobalAdmin(request);
  if (adminError) return adminError;

  return proxyBotApiEndpoint(
    '/performance',
    '[api/performance]',
    'Failed to fetch performance data',
  );
}
