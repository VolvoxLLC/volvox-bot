import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isRequestGlobalAdmin } from '@/lib/global-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const isGlobalAdmin = await isRequestGlobalAdmin(request);
  return NextResponse.json({ isGlobalAdmin });
}
