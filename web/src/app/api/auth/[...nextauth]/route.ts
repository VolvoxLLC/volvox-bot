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

async function handleAuth(request: NextRequest) {
  try {
    const handler = NextAuth(getAuthOptions());
    return await handler(request);
  } catch (error) {
    return fallbackAuthResponse(request, error);
  }
}

export async function GET(request: NextRequest) {
  return handleAuth(request);
}

export async function POST(request: NextRequest) {
  return handleAuth(request);
}
