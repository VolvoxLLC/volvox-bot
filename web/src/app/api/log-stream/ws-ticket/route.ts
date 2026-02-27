import { createHmac, randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeGuildAdmin } from '@/lib/bot-api-proxy';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** Ticket lifetime — 30 seconds is plenty to open a WebSocket. */
const TICKET_TTL_MS = 30_000;

/**
 * Generate a short-lived HMAC ticket the WS server can validate
 * without the browser ever seeing the raw secret.
 *
 * Format: `<nonce>.<expiry>.<hmac>`
 *
 * The bot WS server recreates the HMAC from (nonce + expiry) using the
 * shared BOT_API_SECRET and verifies it matches + isn't expired.
 */
function createTicket(secret: string): string {
  const nonce = randomBytes(16).toString('hex');
  const expiry = Date.now() + TICKET_TTL_MS;
  const payload = `${nonce}.${expiry}`;
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${hmac}`;
}

/**
 * Returns WebSocket connection info for the log stream.
 *
 * Validates the session and guild-level authorization, generates a short-lived
 * HMAC ticket, and returns the WS URL + ticket. The raw BOT_API_SECRET never
 * leaves the server.
 */
export async function GET(request: NextRequest) {
  const guildId = request.nextUrl.searchParams.get('guildId');
  if (!guildId) {
    return NextResponse.json({ error: 'Missing guildId' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, '[api/logs/ws-ticket]');
  if (authError) return authError;

  const botApiUrl = process.env.BOT_API_URL;
  const botApiSecret = process.env.BOT_API_SECRET;

  if (!botApiUrl || !botApiSecret) {
    logger.error('[api/logs/ws-ticket] BOT_API_URL and BOT_API_SECRET are required');
    return NextResponse.json({ error: 'Bot API is not configured' }, { status: 500 });
  }

  // Convert http(s):// to ws(s):// for WebSocket connection
  let wsUrl: string;
  try {
    const url = new URL(botApiUrl.replace(/\/+$/, ''));
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl = `${url.origin}/ws/logs`;
  } catch {
    logger.error('[api/logs/ws-ticket] Invalid BOT_API_URL', { botApiUrl });
    return NextResponse.json({ error: 'Bot API is not configured correctly' }, { status: 500 });
  }

  const ticket = createTicket(botApiSecret);

  return NextResponse.json({ wsUrl, ticket });
}
