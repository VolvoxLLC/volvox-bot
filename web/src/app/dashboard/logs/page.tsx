'use client';

import { ScrollText } from 'lucide-react';
import { HealthSection } from '@/components/dashboard/health-section';
import { LogFilters } from '@/components/dashboard/log-filters';
import { LogViewer } from '@/components/dashboard/log-viewer';
import { PageHeader } from '@/components/dashboard/page-header';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import { useLogStream } from '@/lib/log-ws';

/**
 * /dashboard/logs — Real-time log viewer and health monitoring page.
 *
 * Connects to the bot's /ws/logs WebSocket endpoint (authenticated via
 * /api/log-stream/ws-ticket) and streams logs in a terminal-style UI.
 * Also displays health cards and restart history.
 */
export default function LogsPage() {
  const guildId = useGuildSelection();
  const { logs, status, sendFilter, clearLogs } = useLogStream({
    enabled: Boolean(guildId),
    guildId,
  });

  return (
    <ErrorBoundary title="Logs failed to load">
      <div className="min-h-0 space-y-6">
        <PageHeader
          icon={ScrollText}
          title="Logs"
          description="Monitor bot health and stream live logs with filters."
        />

        {/* Health cards + restart history */}
        <HealthSection />

        {/* Log stream section */}
        <section className="dashboard-panel min-h-[24rem] space-y-4 rounded-2xl p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Log Stream</h2>
              <p className="text-sm text-muted-foreground">Real-time logs from the bot API</p>
            </div>
          </div>

          <LogFilters onFilterChange={sendFilter} disabled={status !== 'connected'} />

          <div className="min-h-[18rem]">
            <LogViewer logs={logs} status={status} onClear={clearLogs} />
          </div>
        </section>
      </div>
    </ErrorBoundary>
  );
}
