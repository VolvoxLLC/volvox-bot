import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { DashboardRole } from '@/lib/dashboard-roles';
import { getDashboardRole } from '@/lib/dashboard-roles';
import { getMutualGuilds } from '@/lib/discord.server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * GET /api/guilds/[guildId]/role
 * Returns the current user's dashboard role for the guild (viewer, moderator, admin, owner).
 * Used by the sidebar to show role and filter nav. Requires at least viewer (user must be in the guild).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
): Promise<NextResponse<{ role: DashboardRole } | { error: string }>> {
  const { guildId } = await params;
  if (!guildId) {
    return NextResponse.json({ error: 'Missing guildId' }, { status: 400 });
  }

  const token = await getToken({ req: request });
  if (typeof token?.accessToken !== 'string' || token.accessToken.length === 0) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (token.error === 'RefreshTokenError') {
    return NextResponse.json({ error: 'Token expired. Please sign in again.' }, { status: 401 });
  }

  let mutualGuilds: Awaited<ReturnType<typeof getMutualGuilds>>;
  try {
    mutualGuilds = await getMutualGuilds(
      token.accessToken,
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    );
  } catch (error) {
    logger.error('[api/guilds/:guildId/role] Failed to fetch guilds:', error);
    return NextResponse.json({ error: 'Failed to verify guild permissions' }, { status: 502 });
  }

  const guild = mutualGuilds.find((g) => g.id === guildId);
  if (!guild) {
    return NextResponse.json({ error: 'You do not have access to this guild' }, { status: 403 });
  }

  const role = getDashboardRole(guild.permissions, guild.owner);
  return NextResponse.json({ role });
}
