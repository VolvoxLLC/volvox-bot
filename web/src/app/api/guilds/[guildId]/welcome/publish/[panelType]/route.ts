import type { NextRequest } from 'next/server';
import { proxyWelcomeRequest } from '../../_utils/proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/welcome/publish/:panelType]';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; panelType: string }> },
) {
  const { guildId, panelType } = await params;

  return proxyWelcomeRequest({
    request,
    guildId,
    pathSuffix: `/publish/${encodeURIComponent(panelType)}`,
    logPrefix: LOG_PREFIX,
    errorMessage: 'Failed to publish welcome panel',
    proxyOptions: { method: 'POST' },
  });
}
