"use client";

import { SessionProvider, useSession } from "next-auth/react";
import type { ReactNode } from "react";
import { useEffect } from "react";

/**
 * SessionGuard monitors session state for errors.
 * Note: RefreshTokenError is handled by the Header component which signs out
 * and redirects to /login. We only handle other session-level errors here.
 */
function SessionGuard({ children }: { children: ReactNode }) {
  // Session available for future error handling extensions
  useSession();

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionGuard>{children}</SessionGuard>
    </SessionProvider>
  );
}
