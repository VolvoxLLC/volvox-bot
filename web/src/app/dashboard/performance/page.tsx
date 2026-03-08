import type { Metadata } from 'next';
import { PerformanceDashboard } from '@/components/dashboard/performance-dashboard';
import { createPageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = createPageMetadata(
  'Performance',
  'Inspect bot uptime, latency, and resource trends.',
);

export default function PerformancePage() {
  return <PerformanceDashboard />;
}
