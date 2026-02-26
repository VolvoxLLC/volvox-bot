import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getMutualGuilds } from '@/lib/discord.server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** Request timeout for the guilds endpoint (10 seconds). */
const REQUEST_TIMEOUT_MS = 10_000;

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request });

  if (!token?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // If the JWT refresh previously failed, don't send a stale token to Discord
  if (token.error === 'RefreshTokenError') {
    return NextResponse.json({ error: 'Token expired. Please sign in again.' }, { status: 401 });
  }

  try {
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const guilds = await getMutualGuilds(token.accessToken as string, signal);
    return NextResponse.json(guilds);
  } catch (error) {
    logger.error('[api/guilds] Failed to fetch guilds:', error);
    return NextResponse.json({ error: 'Failed to fetch guilds' }, { status: 500 });
  }
}
