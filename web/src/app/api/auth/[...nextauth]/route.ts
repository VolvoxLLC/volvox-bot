import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';

function fallbackAuthResponse(request: NextRequest, error: unknown) {
  const pathname = request.nextUrl.pathname;
  logger.warn('[auth] Auth route requested without valid environment configuration', {
    pathname,
    error: error instanceof Error ? error.message : String(error),
  });

  if (pathname.endsWith('/session')) {
    return NextResponse.json({}, { status: 200 });
  }

  if (pathname.endsWith('/providers')) {
    return NextResponse.json({}, { status: 200 });
  }

  if (pathname.endsWith('/csrf')) {
    return NextResponse.json({ csrfToken: '' }, { status: 200 });
  }

  return NextResponse.json({ error: 'AuthUnavailable' }, { status: 503 });
}

// Cache the NextAuth handler after the first successful creation to avoid
// reconstructing it on every request (getAuthOptions() is already cached internally).
let cachedHandler: ReturnType<typeof NextAuth> | undefined;

function getHandler() {
  if (!cachedHandler) {
    cachedHandler = NextAuth(getAuthOptions());
  }
  return cachedHandler;
}

async function handleAuth(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  try {
    const handler = getHandler();
    return await handler(request, context);
  } catch (error) {
    // Reset cache on failure so next request retries handler creation
    cachedHandler = undefined;
    return fallbackAuthResponse(request, error);
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  return handleAuth(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  return handleAuth(request, context);
}
