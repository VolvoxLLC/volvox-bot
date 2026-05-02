import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getBotApiBaseUrl } from '@/lib/bot-api';
import { getMutualGuilds } from '@/lib/discord.server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** Request timeout for the guilds endpoint (10 seconds). */
const REQUEST_TIMEOUT_MS = 10_000;
const VALID_ACCESS_LEVELS = new Set(['admin', 'moderator', 'viewer']);
const MAX_ACCESS_LOOKUP_GUILDS = 100;

async function applyAccessLevels(
  guilds: Awaited<ReturnType<typeof getMutualGuilds>>,
  userId: string,
  signal: AbortSignal,
) {
  const botApiBaseUrl = getBotApiBaseUrl();
  const botApiSecret = process.env.BOT_API_SECRET;

  if (!botApiBaseUrl || !botApiSecret || guilds.length === 0) {
    return guilds;
  }

  const botGuildIds = guilds.filter((guild) => guild.botPresent).map((guild) => guild.id);
  if (botGuildIds.length === 0) {
    return guilds;
  }

  try {
    const accessMap = new Map<string, 'admin' | 'moderator' | 'viewer'>();

    for (let start = 0; start < botGuildIds.length; start += MAX_ACCESS_LOOKUP_GUILDS) {
      const guildIdChunk = botGuildIds.slice(start, start + MAX_ACCESS_LOOKUP_GUILDS);
      const url = new URL(`${botApiBaseUrl}/guilds/access`);
      url.searchParams.set('userId', userId);
      url.searchParams.set('guildIds', guildIdChunk.join(','));

      const response = await fetch(url.toString(), {
        headers: {
          'x-api-secret': botApiSecret,
        },
        signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        logger.warn('[api/guilds] Failed to fetch bot access levels', {
          status: response.status,
          statusText: response.statusText,
          guildCount: guildIdChunk.length,
        });
        return guilds;
      }

      const accessEntries: unknown = await response.json();
      if (!Array.isArray(accessEntries)) {
        return guilds;
      }

      for (const entry of accessEntries) {
        if (
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as { id?: unknown }).id === 'string' &&
          typeof (entry as { access?: unknown }).access === 'string' &&
          VALID_ACCESS_LEVELS.has((entry as { access: string }).access)
        ) {
          accessMap.set(
            (entry as { id: string }).id,
            (entry as { access: 'admin' | 'moderator' | 'viewer' }).access,
          );
        }
      }
    }

    return guilds.map((guild) => ({
      ...guild,
      access: accessMap.get(guild.id) ?? guild.access,
    }));
  } catch (error) {
    logger.warn('[api/guilds] Failed to augment guild access levels', error);
    return guilds;
  }
}

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
    const userId =
      typeof token.id === 'string' ? token.id : typeof token.sub === 'string' ? token.sub : '';
    const guildsWithAccess = userId ? await applyAccessLevels(guilds, userId, signal) : guilds;
    return NextResponse.json(guildsWithAccess);
  } catch (error) {
    logger.error('[api/guilds] Failed to fetch guilds:', error);
    return NextResponse.json({ error: 'Failed to fetch guilds' }, { status: 500 });
  }
}
