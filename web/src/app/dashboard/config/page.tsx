import type { Metadata } from 'next';
import { ConfigEditor } from '@/components/dashboard/config-editor';

export const metadata: Metadata = {
  title: 'Config Editor',
  description: 'Manage your bot configuration settings.',
};

/**
 * Page component that renders the dashboard configuration editor.
 *
 * @returns The React element rendering the `ConfigEditor` for managing dashboard configuration.
 */
export default function ConfigPage() {
  return <ConfigEditor />;
}
