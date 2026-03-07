import type { Metadata } from 'next';
import { AnalyticsDashboard } from '@/components/dashboard/analytics-dashboard';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { createPageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = createPageMetadata(
  'Overview',
  'Monitor bot analytics and dashboard health at a glance.',
);

export default function DashboardPage() {
  return (
    <ErrorBoundary
      title="Analytics failed to load"
      description="There was a problem loading the dashboard analytics. Select a different server or try again."
    >
      <AnalyticsDashboard />
    </ErrorBoundary>
  );
}
