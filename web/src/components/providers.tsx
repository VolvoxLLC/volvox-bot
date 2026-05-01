'use client';

import * as Sentry from '@sentry/nextjs';
import { usePathname } from 'next/navigation';
import { SessionProvider, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { type ReactNode, useEffect, useRef } from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';
import { useGuildSelection } from '@/hooks/use-guild-selection';
import {
  DASHBOARD_PAGE_VIEW_EVENT,
  initDashboardAmplitude,
  trackDashboardEvent,
} from '@/lib/amplitude';

function isDashboardRoute(pathname: string | null): pathname is string {
  return pathname === '/dashboard' || pathname?.startsWith('/dashboard/') === true;
}

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
 * Synchronizes Sentry context with the current route and dashboard guild scope.
 *
 * Updates Sentry's `routing` context with the current pathname (or `unknown`) and
 * only attaches `guild` context for authenticated dashboard routes with a selected
 * guild. The guild context is cleared everywhere else so persisted dashboard state
 * does not leak into public routes.
 *
 * @returns `null` — the component does not render any UI.
 */
function SentryContextBridge() {
  const pathname = usePathname();
  const guildId = useGuildSelection();
  const { status } = useSession();
  const isAuthenticatedDashboardRoute = status === 'authenticated' && isDashboardRoute(pathname);

  useEffect(() => {
    Sentry.setContext('routing', { route: pathname || 'unknown' });

    if (isAuthenticatedDashboardRoute && guildId) {
      Sentry.setContext('guild', { id: guildId });
      return;
    }

    Sentry.setContext('guild', null);
  }, [guildId, isAuthenticatedDashboardRoute, pathname]);

  return null;
}

/**
 * Synchronizes Amplitude: initializes it with the current authenticated user and records dashboard page-view events once per route.
 *
 * The emitted event includes the current `authStatus`, `guildId` (defaults to `'none'` when not set), and `route` (defaults to `'unknown'` when not set).
 *
 * @returns `null` (this component does not render UI)
 */
function AmplitudeContextBridge() {
  const pathname = usePathname();
  const guildId = useGuildSelection();
  const { data: session, status } = useSession();
  const userId = status === 'authenticated' ? session?.user?.id : null;
  const lastTrackedRouteRef = useRef<string | null>(null);

  useEffect(() => {
    initDashboardAmplitude(userId);
  }, [userId]);

  useEffect(() => {
    if (!isDashboardRoute(pathname)) {
      lastTrackedRouteRef.current = null;
      return;
    }

    if (lastTrackedRouteRef.current === pathname) {
      return;
    }

    lastTrackedRouteRef.current = pathname;
    trackDashboardEvent(DASHBOARD_PAGE_VIEW_EVENT, {
      authStatus: status,
      guildId: guildId || 'none',
      route: pathname,
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
