import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ConfigProvider } from '@/components/dashboard/config-context';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { GuildDirectoryProvider } from '@/components/layout/guild-directory-context';
import { authOptions } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth: server-side auth check in addition to proxy.ts.
  // Prevents unauthenticated access if the proxy/middleware layer is bypassed.
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect('/login');
  }

  return (
    <GuildDirectoryProvider>
      <ConfigProvider>
        <DashboardShell>{children}</DashboardShell>
      </ConfigProvider>
    </GuildDirectoryProvider>
  );
}
