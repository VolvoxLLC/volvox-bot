import type { NextRequest } from 'next/server';
import { proxyWelcomeRequest } from '../_utils/proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/welcome/status]';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params;

  return proxyWelcomeRequest({
    request,
    guildId,
    pathSuffix: '/status',
    logPrefix: LOG_PREFIX,
    errorMessage: 'Failed to fetch welcome publish status',
  });
}
