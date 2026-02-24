"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import type { ReactNode } from "react";

/**
 * Root provider wrapper.
 * Session error handling (e.g. RefreshTokenError) is handled by the Header
 * component which signs out and redirects to /login.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster position="bottom-right" theme="dark" richColors />
    </SessionProvider>
  );
}
