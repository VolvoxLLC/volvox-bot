'use client';

import * as Sentry from '@sentry/nextjs';
import { usePathname } from 'next/navigation';
import { SessionProvider, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect } from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import {
  DASHBOARD_PAGE_VIEW_EVENT,
  initDashboardAmplitude,
  trackDashboardEvent,
} from '@/lib/amplitude';

/**
 * Render a global Toaster that follows the resolved application theme.
 *
 * @returns A React element mounting a Toaster at the bottom-right with its theme set to 'light' or 'dark' when available, otherwise 'system'; `richColors` enabled.
 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={(resolvedTheme as 'light' | 'dark') ?? 'system'}
      richColors
    />
  );
}

/**
 * Synchronizes Sentry context with the current dashboard route and selected guild.
 *
 * Updates Sentry's `routing` context with the current pathname (or `unknown`) and
 * `guild` context with the selected guild id (or `none`) whenever the route or
 * guild selection changes.
 *
 * @returns `null` — the component does not render any UI.
 */
function SentryContextBridge() {
  const pathname = usePathname();
  const guildId = useGuildSelection();

  useEffect(() => {
    Sentry.setContext('routing', { route: pathname || 'unknown' });
    Sentry.setContext('guild', { id: guildId || 'none' });
  }, [guildId, pathname]);

  return null;
}

/**
 * Synchronizes Amplitude: initializes it with the current authenticated user and records dashboard page-view events when the auth status, route, or selected guild change.
 *
 * The emitted event includes `authStatus`, `guildId` (defaults to `'none'` when not set), and `route` (defaults to `'unknown'` when not set).
 *
 * @returns `null` (this component does not render UI)
 */
function AmplitudeContextBridge() {
  const pathname = usePathname();
  const guildId = useGuildSelection();
  const { data: session, status } = useSession();
  const userId = status === 'authenticated' ? session?.user?.id : null;

  useEffect(() => {
    initDashboardAmplitude(userId);
  }, [userId]);

  useEffect(() => {
    trackDashboardEvent(DASHBOARD_PAGE_VIEW_EVENT, {
      authStatus: status,
      guildId: guildId || 'none',
      route: pathname || 'unknown',
    });
  }, [guildId, pathname, status]);

  return null;
}

/**
 * Composes application context providers (authentication and theme), mounts telemetry bridges, and renders global UI chrome.
 *
 * @param children - The application UI to render inside the provider tree
 * @returns A React element containing the provider tree that wraps `children`, mounts Sentry and Amplitude context bridges, and renders the themed global Toaster
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <SentryContextBridge />
        <AmplitudeContextBridge />
        {children}
        <ThemedToaster />
      </ThemeProvider>
    </SessionProvider>
  );
}
