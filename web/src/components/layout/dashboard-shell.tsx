import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { ServerSelector } from "./server-selector";

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
    <div className="flex min-h-screen flex-col">
      <Header />

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden w-64 shrink-0 border-r bg-background md:block">
          <div className="p-4">
            <ServerSelector />
          </div>
          <Sidebar />
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
