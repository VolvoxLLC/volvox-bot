import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { authOptions } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth: server-side auth check in addition to proxy.ts.
  // Prevents unauthenticated access if the proxy/middleware layer is bypassed.
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
