import type { Metadata } from 'next';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { createPageMetadata } from '@/lib/page-titles';
import TicketsClient from './tickets-client';

export const metadata: Metadata = createPageMetadata(
  'Tickets',
  'Manage support tickets and view transcripts.',
);

export default function TicketsPage() {
  return (
    <ErrorBoundary title="Tickets failed to load">
      <TicketsClient />
    </ErrorBoundary>
  );
}
