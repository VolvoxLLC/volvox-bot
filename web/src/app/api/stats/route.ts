import { NextResponse } from 'next/server';
import { getBotApiBaseUrl } from '@/lib/bot-api';

export const dynamic = 'force-dynamic';

/**
 * Public stats proxy — forwards to the bot backend's /stats endpoint.
 * No authentication required (bot endpoint is itself public + rate-limited).
 * Uses BOT_API_URL (same env var as all other bot API proxies).
 */
export async function GET() {
  const baseUrl = getBotApiBaseUrl();
  if (!baseUrl) {
    return NextResponse.json({ error: 'Bot API not configured' }, { status: 503 });
  }

  try {
    const response = await fetch(`${baseUrl}/stats`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Bot API unavailable' }, { status: 503 });
  }
}
