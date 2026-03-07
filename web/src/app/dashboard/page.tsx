import { AnalyticsDashboard } from '@/components/dashboard/analytics-dashboard';
import { ErrorBoundary } from '@/components/ui/error-boundary';

export default function DashboardPage() {
  return (
    <ErrorBoundary title="Analytics failed to load" description="There was a problem loading the dashboard analytics. Select a different server or try again.">
      <AnalyticsDashboard />
    </ErrorBoundary>
  );
}
