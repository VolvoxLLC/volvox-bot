import type { Metadata } from 'next';
import { ConfigEditor } from '@/components/dashboard/config-editor';
import { createPageMetadata } from '@/lib/page-titles';

export const metadata: Metadata = createPageMetadata(
  'Bot Config',
  'Manage your bot configuration settings.',
);

/**
 * Page component that renders the dashboard configuration editor.
 *
 * @returns The React element rendering the `ConfigEditor` for managing dashboard configuration.
 */
export default function ConfigPage() {
  return <ConfigEditor />;
}
