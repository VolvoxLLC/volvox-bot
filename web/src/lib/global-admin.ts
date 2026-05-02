import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken, type JWT } from 'next-auth/jwt';
import { getAuthOptions } from '@/lib/auth';

function getGlobalAdminIds(): Set<string> {
  return new Set(
    (process.env.BOT_OWNER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

function getTokenUserId(token: JWT | null): string | null {
  if (typeof token?.id === 'string' && token.id.length > 0) {
    return token.id;
  }

  if (typeof token?.sub === 'string' && token.sub.length > 0) {
    return token.sub;
  }

  return null;
}

function isGlobalAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return getGlobalAdminIds().has(userId);
}

export type RequestGlobalAdminAuthResult =
  | { ok: true; token: JWT }
  | { ok: false; reason: 'unauthorized' | 'token-expired' | 'forbidden'; token: JWT | null };

export async function getRequestGlobalAdminAuth(
  request: NextRequest,
): Promise<RequestGlobalAdminAuthResult> {
  let token: JWT | null;
  try {
    token = await getToken({ req: request });
  } catch {
    return { ok: false, reason: 'unauthorized', token: null };
  }

  if (!token) {
    return { ok: false, reason: 'unauthorized', token: null };
  }

  if (token.error === 'RefreshTokenError') {
    return { ok: false, reason: 'token-expired', token };
  }

  if (typeof token.accessToken !== 'string' || token.accessToken.length === 0) {
    return { ok: false, reason: 'unauthorized', token };
  }

  if (!isGlobalAdminUserId(getTokenUserId(token))) {
    return { ok: false, reason: 'forbidden', token };
  }

  return { ok: true, token };
}

export function globalAdminAuthErrorResponse(
  auth: Extract<RequestGlobalAdminAuthResult, { ok: false }>,
): NextResponse {
  if (auth.reason === 'token-expired') {
    return NextResponse.json({ error: 'Token expired. Please sign in again.' }, { status: 401 });
  }

  if (auth.reason === 'unauthorized') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function authorizeRequestGlobalAdmin(
  request: NextRequest,
): Promise<NextResponse | null> {
  const auth = await getRequestGlobalAdminAuth(request);
  return auth.ok ? null : globalAdminAuthErrorResponse(auth);
}

export async function isRequestGlobalAdmin(request: NextRequest): Promise<boolean> {
  const auth = await getRequestGlobalAdminAuth(request);
  return auth.ok;
}

export async function isDashboardGlobalAdmin(): Promise<boolean> {
  try {
    const session = await getServerSession(getAuthOptions());
    if (session?.error === 'RefreshTokenError') {
      return false;
    }

    return isGlobalAdminUserId(session?.user?.id);
  } catch {
    return false;
  }
}
