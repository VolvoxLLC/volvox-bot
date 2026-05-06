import type { NextRequest } from 'next/server';
import { proxyWelcomeRequest } from '../_utils/proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/welcome/publish]';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> },
) {
  const { guildId } = await params;

  return proxyWelcomeRequest({
    request,
    guildId,
    pathSuffix: '/publish',
    logPrefix: LOG_PREFIX,
    errorMessage: 'Failed to publish welcome',
    proxyOptions: { method: 'POST' },
  });
}
