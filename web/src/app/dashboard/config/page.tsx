import type { Metadata } from 'next';
import { ConfigLandingContent } from '@/components/dashboard/config-categories/config-landing';
import { createPageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = createPageMetadata(
  'Bot Config',
  'Manage your bot configuration settings.',
);

/**
 * Config landing page — renders category cards for navigating to config sections.
 */
export default function ConfigPage() {
  return <ConfigLandingContent />;
}
