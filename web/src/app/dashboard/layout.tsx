import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { ConfigProvider } from '@/components/dashboard/config-context';
import { ChannelDirectoryProvider } from '@/components/layout/channel-directory-context';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { GuildDirectoryProvider } from '@/components/layout/guild-directory-context';
import { RoleDirectoryProvider } from '@/components/layout/role-directory-context';
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
      <ChannelDirectoryProvider>
        <RoleDirectoryProvider>
          <ConfigProvider>
            <DashboardShell>{children}</DashboardShell>
          </ConfigProvider>
        </RoleDirectoryProvider>
      </ChannelDirectoryProvider>
    </GuildDirectoryProvider>
  );
}
