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
    <div className="dashboard-canvas dashboard-grid flex min-h-screen flex-col bg-background">
      <DashboardTitleSync />
      <Header />

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden min-h-0 w-80 shrink-0 border-r border-border/60 bg-gradient-to-b from-card/85 via-card/65 to-background/70 md:flex md:flex-col">
          <div className="px-4 pt-5 pb-3">
            <ServerSelector />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
            <Sidebar />
          </div>
        </aside>

        {/* Main content */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1560px] p-3 md:p-6 lg:p-8">
            <div className="dashboard-fade-in min-h-[calc(100vh-7.9rem)]">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
