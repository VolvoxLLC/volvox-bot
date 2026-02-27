import { type NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

/**
 * Route protection middleware.
 *
 * Compatibility note: This file uses the Next.js 16 `proxy` export convention
 * (renamed from `middleware`). NextAuth v4 relies on standard Next.js middleware
 * patterns and is installed with --legacy-peer-deps for Next.js 16 compatibility.
 * The proxy export works correctly as middleware for route protection.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/proxy
 */
export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request });

  if (!token || token.error === 'RefreshTokenError') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
