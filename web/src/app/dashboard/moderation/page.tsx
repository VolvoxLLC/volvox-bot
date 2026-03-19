import type { Metadata } from 'next';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { createPageMetadata } from '@/lib/page-titles';
import ModerationClient from './moderation-client';

export const metadata: Metadata = createPageMetadata(
  'Moderation',
  'Review cases, track activity, and audit your moderation team.',
);

export default function ModerationPage() {
  return (
    <ErrorBoundary title="Moderation failed to load">
      <ModerationClient />
    </ErrorBoundary>
  );
}
