import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PerformanceDashboard } from '@/components/dashboard/performance-dashboard';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { isDashboardGlobalAdmin } from '@/lib/global-admin';
import { createPageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = createPageMetadata(
  'Performance',
  'Inspect bot uptime, latency, and resource trends.',
);

export default async function PerformancePage() {
  if (!(await isDashboardGlobalAdmin())) {
    redirect('/dashboard');
  }

  return (
    <ErrorBoundary
      title="Performance metrics failed to load"
      description="There was a problem loading the performance dashboard. Try again or refresh the page."
    >
      <PerformanceDashboard />
    </ErrorBoundary>
  );
}
