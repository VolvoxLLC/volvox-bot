import type { ReactNode } from 'react';
import { SettingsTabs } from '@/components/dashboard/settings-tabs';
import { AnalyticsProvider } from '@/contexts/analytics-context';
import { DashboardTitleSync } from './dashboard-title-sync';
import { Header } from './header';
import { Sidebar } from './sidebar';

interface DashboardShellProps {
  children: ReactNode;
}

/**
 * Server component shell for the dashboard layout.
 * Mobile sidebar toggle is in its own client component (MobileSidebar)
 * which is rendered inside the Header.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <AnalyticsProvider>
      <div className="dashboard-canvas relative flex h-[100dvh] w-full max-h-screen overflow-hidden bg-background">
        <DashboardTitleSync />

        {/* Desktop sidebar */}
        <aside className="hidden h-full w-[260px] min-h-0 shrink-0 flex-col border-r border-border/40 bg-background md:flex">
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-none relative">
            <Sidebar />
          </div>
        </aside>

        {/* Right side: Header + Content */}
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <Header />

          <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 lg:px-10">
              <SettingsTabs />
              <div className="dashboard-fade-in pb-12">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </AnalyticsProvider>
  );
}
