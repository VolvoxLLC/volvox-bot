/**
 * Next.js API proxy for temp role endpoints.
 * Proxies GET (list) and POST (assign) to the bot API.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/128
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  authorizeGuildAdmin,
  buildUpstreamUrl,
  getBotApiConfig,
  proxyToBotApi,
} from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/temp-roles]';
const ALLOWED_GET_PARAMS = ['guildId', 'userId', 'page', 'limit'];

/**
 * GET /api/temp-roles?guildId=...
 * Lists active temp role assignments for a guild.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const guildId = request.nextUrl.searchParams.get('guildId');
  if (!guildId) {
    return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const config = getBotApiConfig(LOG_PREFIX);
  if (config instanceof NextResponse) return config;

  const upstream = buildUpstreamUrl(config.baseUrl, '/temp-roles', LOG_PREFIX);
  if (upstream instanceof NextResponse) return upstream;

  for (const key of ALLOWED_GET_PARAMS) {
    const value = request.nextUrl.searchParams.get(key);
    if (value !== null) upstream.searchParams.set(key, value);
  }

  return proxyToBotApi(upstream, config.secret, LOG_PREFIX, 'Failed to fetch temp roles');
}

/**
 * POST /api/temp-roles
 * Assigns a temporary role via the dashboard.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const guildId = body.guildId;
  if (!guildId) {
    return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const config = getBotApiConfig(LOG_PREFIX);
  if (config instanceof NextResponse) return config;

  const upstream = buildUpstreamUrl(config.baseUrl, '/temp-roles', LOG_PREFIX);
  if (upstream instanceof NextResponse) return upstream;

  try {
    const res = await fetch(upstream.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-secret': config.secret,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (_err) {
    return NextResponse.json({ error: 'Failed to assign temp role' }, { status: 502 });
  }
}
