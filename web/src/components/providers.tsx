'use client';

import { SessionProvider } from 'next-auth/react';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

/**
 * Wraps application UI with NextAuth session context and a global toast container.
 *
 * Session error handling (e.g. RefreshTokenError) is handled elsewhere (the Header component),
 * which signs out and redirects to /login.
 *
 * @returns A React element that renders a SessionProvider around `children` and mounts a Toaster
 *          positioned at the bottom-right with system theme and rich colors enabled.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster position="bottom-right" theme="system" richColors />
    </SessionProvider>
  );
}
