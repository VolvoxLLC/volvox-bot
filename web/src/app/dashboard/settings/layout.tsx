import type { ReactNode } from 'react';
import { ConfigLayoutShell } from '@/components/dashboard/config-layout-shell';

/**
 * Config section layout — wraps all `/dashboard/config/*` routes with
 * the ConfigProvider and persistent navigation/save chrome.
 */
export default function ConfigLayout({ children }: { children: ReactNode }) {
  return <ConfigLayoutShell>{children}</ConfigLayoutShell>;
}
