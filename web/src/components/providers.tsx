'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider } from '@/components/theme-provider';

/**
 * Wraps application UI with NextAuth session context, theme provider, and a global toast container.
 *
 * Session error handling (e.g. RefreshTokenError) is handled elsewhere (the Header component),
 * which signs out and redirects to /login.
 *
 * Theme defaults to system preference with CSS variable-based dark/light mode support.
 *
 * @returns A React element that renders providers around `children` and mounts a Toaster
 *          positioned at the bottom-right with system theme and rich colors enabled.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange={false}
      >
        {children}
        <Toaster position="bottom-right" theme="system" richColors />
      </ThemeProvider>
    </SessionProvider>
  );
}
