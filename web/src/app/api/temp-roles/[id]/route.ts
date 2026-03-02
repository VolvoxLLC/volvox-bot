/**
 * Next.js API proxy — DELETE /api/temp-roles/:id
 * Revokes a specific temp role assignment.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/128
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { authorizeGuildAdmin, buildUpstreamUrl, getBotApiConfig } from '@/lib/bot-api-proxy';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[api/temp-roles/:id]';

/**
 * DELETE /api/temp-roles/:id?guildId=...
 * Revokes a temp role by record ID.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const guildId = request.nextUrl.searchParams.get('guildId');

  if (!guildId) {
    return NextResponse.json({ error: 'guildId is required' }, { status: 400 });
  }

  const authError = await authorizeGuildAdmin(request, guildId, LOG_PREFIX);
  if (authError) return authError;

  const config = getBotApiConfig(LOG_PREFIX);
  if (config instanceof NextResponse) return config;

  const upstream = buildUpstreamUrl(
    config.baseUrl,
    `/temp-roles/${encodeURIComponent(id)}`,
    LOG_PREFIX,
  );
  if (upstream instanceof NextResponse) return upstream;

  upstream.searchParams.set('guildId', guildId);

  try {
    const res = await fetch(upstream.toString(), {
      method: 'DELETE',
      headers: { 'x-api-secret': config.secret },
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to revoke temp role' }, { status: 502 });
  }
}
