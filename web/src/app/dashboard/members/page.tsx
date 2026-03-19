import type { Metadata } from 'next';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { createPageMetadata } from '@/lib/page-titles';
import MembersClient from './members-client';

export const metadata: Metadata = createPageMetadata(
  'Members',
  'View member activity, XP, levels, and moderation history.',
);

export default function MembersPage() {
  return (
    <ErrorBoundary title="Members failed to load">
      <MembersClient />
    </ErrorBoundary>
  );
}
