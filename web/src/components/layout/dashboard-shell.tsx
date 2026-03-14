import { DashboardTitleSync } from './dashboard-title-sync';
import { Header } from './header';
import { ServerSelector } from './server-selector';
import { Sidebar } from './sidebar';

interface DashboardShellProps {
  children: React.ReactNode;
}

/**
 * Server component shell for the dashboard layout.
 * Mobile sidebar toggle is in its own client component (MobileSidebar)
 * which is rendered inside the Header.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <DashboardTitleSync />
      <Header />

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-border/50 bg-card/50 md:flex md:flex-col">
          <div className="px-3 pt-4 pb-2">
            <ServerSelector />
          </div>
          <div className="flex-1 overflow-y-auto">
            <Sidebar />
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1460px] p-5 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
