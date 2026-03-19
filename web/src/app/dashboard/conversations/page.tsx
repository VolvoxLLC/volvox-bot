import type { Metadata } from 'next';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { createPageMetadata } from '@/lib/page-titles';
import ConversationsClient from './conversations-client';

export const metadata: Metadata = createPageMetadata(
  'Conversations',
  'Browse, search, and replay AI conversations.',
);

export default function ConversationsPage() {
  return (
    <ErrorBoundary title="Conversations failed to load">
      <ConversationsClient />
    </ErrorBoundary>
  );
}
