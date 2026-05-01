import { NextResponse } from 'next/server';
import { isDashboardGlobalAdmin } from '@/lib/global-admin';

export async function GET() {
  const isGlobalAdmin = await isDashboardGlobalAdmin();
  return NextResponse.json({ isGlobalAdmin });
}
