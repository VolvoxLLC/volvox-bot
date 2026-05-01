import type { NextRequest } from 'next/server';
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

function isAuthorizedToken(token: JWT | null): boolean {
  if (!token || token.error === 'RefreshTokenError') {
    return false;
  }

  return isGlobalAdminUserId(getTokenUserId(token));
}

export async function isRequestGlobalAdmin(request: NextRequest): Promise<boolean> {
  try {
    return isAuthorizedToken(await getToken({ req: request }));
  } catch {
    return false;
  }
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
