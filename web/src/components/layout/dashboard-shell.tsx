import type { ReactNode } from 'react';
import { DashboardTitleSync } from './dashboard-title-sync';
import { Header } from './header';
import { ServerSelector } from './server-selector';
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
    <div className="dashboard-canvas dashboard-grid flex min-h-screen flex-col bg-background">
      <DashboardTitleSync />
      <Header />

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden min-h-0 w-72 shrink-0 border-r border-border/40 bg-gradient-to-b from-card/90 via-card/60 to-background/80 md:flex md:flex-col">
          <div className="px-3 pt-4 pb-3">
            <ServerSelector />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-3">
            <Sidebar />
          </div>
        </aside>

        {/* Main content */}
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto w-full max-w-[1560px] p-3 md:p-6 lg:p-8">
            <div className="dashboard-fade-in min-h-[calc(100vh-7.9rem)]">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
