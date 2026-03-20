import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/guilds/:guildId/members/:userId/xp]';

/** Maximum absolute XP adjustment allowed in a single request. */
const MAX_XP_AMOUNT = 1_000_000;

/** Maximum length of the optional reason string. */
const MAX_REASON_LENGTH = 500;

/**
 * Proxy an XP adjustment request for a guild member to the bot API.
 *
 * Accepts a JSON body of the form `{ amount: number, reason?: string }` and forwards it to the bot API endpoint for the specified guild and user.
 *
 * @param request - The incoming NextRequest
 * @param params - A promise resolving to route parameters containing `guildId` and `userId`
 * @returns The response from the bot API proxy or a NextResponse indicating an early error (e.g., missing IDs, auth failure, invalid JSON)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; userId: string }> },
) {
  const { guildId, userId } = await params;
  if (!guildId || !userId) {
    return NextResponse.json({ error: 'Missing guildId or userId' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const apiConfig = getBotApiConfig(LOG_PREFIX);
  if (apiConfig instanceof NextResponse) return apiConfig;

  let body: string;
  try {
    const json: unknown = await request.json();

    // Validate payload shape before forwarding (defense-in-depth)
    if (typeof json !== 'object' || json === null || Array.isArray(json)) {
      return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
    }
    const payload = json as Record<string, unknown>;

    if (!('amount' in payload)) {
      return NextResponse.json({ error: 'Missing required field: amount' }, { status: 400 });
    }
    if (
      typeof payload.amount !== 'number' ||
      !Number.isFinite(payload.amount) ||
      !Number.isInteger(payload.amount)
    ) {
      return NextResponse.json(
        { error: 'Field "amount" must be a finite integer' },
        { status: 400 },
      );
    }
    if (payload.amount === 0) {
      return NextResponse.json({ error: 'Field "amount" must not be zero' }, { status: 400 });
    }
    if (Math.abs(payload.amount) > MAX_XP_AMOUNT) {
      return NextResponse.json(
        { error: `Field "amount" must be between -${MAX_XP_AMOUNT} and ${MAX_XP_AMOUNT}` },
        { status: 400 },
      );
    }
    if ('reason' in payload && payload.reason !== undefined && typeof payload.reason !== 'string') {
      return NextResponse.json(
        { error: 'Field "reason" must be a string when provided' },
        { status: 400 },
      );
    }
    if (typeof payload.reason === 'string' && payload.reason.length > MAX_REASON_LENGTH) {
      return NextResponse.json(
        { error: `Field "reason" must be at most ${MAX_REASON_LENGTH} characters` },
        { status: 400 },
      );
    }

    // Only forward the known fields — strip unknown keys
    const sanitized: { amount: number; reason?: string } = { amount: payload.amount as number };
    if (typeof payload.reason === 'string') sanitized.reason = payload.reason;

    body = JSON.stringify(sanitized);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const upstreamUrl = buildUpstreamUrl(
    apiConfig.baseUrl,
    `/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/xp`,
    LOG_PREFIX,
  );
  if (upstreamUrl instanceof NextResponse) return upstreamUrl;

  return proxyToBotApi(upstreamUrl, apiConfig.secret, LOG_PREFIX, 'Failed to adjust XP', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
