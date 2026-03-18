import type { Metadata } from 'next';
import { ConfigLandingContent } from '@/components/dashboard/config-categories/config-landing';
import { createPageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = createPageMetadata(
  'Settings',
  'Manage your bot configuration settings.',
);

/**
 * Settings landing page — renders category cards for navigating to settings sections.
 */
export default function SettingsPage() {
  return <ConfigLandingContent />;
}
