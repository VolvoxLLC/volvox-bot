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
 * Render a global Toaster whose visual theme follows the resolved app theme.
 *
 * @returns A React element mounting a Toaster at the bottom-right with its `theme` set to the resolved theme (`'light'` or `'dark'`, falling back to `'system'` if unresolved) and `richColors` enabled.
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
 * Keeps Sentry context aligned with the current dashboard route and selected guild.
 *
 * @returns Null because it only synchronizes telemetry context.
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
 * Keeps Amplitude initialized and records dashboard route changes.
 *
 * @returns Null because it only synchronizes telemetry context.
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
 * Wraps application UI with NextAuth session context, theme provider, and a global toast container.
 *
 * Session error handling (e.g. RefreshTokenError) is handled elsewhere (the Header component),
 * which signs out and redirects to /login.
 *
 * Theme defaults to system preference with CSS variable-based dark/light mode support.
 *
 * @returns A React element that renders providers around `children` and mounts a Toaster
 *          positioned at the bottom-right with resolved theme (light/dark) and rich colors enabled.
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
