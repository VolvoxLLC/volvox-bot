"use client";

import { SessionProvider, useSession, signIn } from "next-auth/react";
import type { ReactNode } from "react";
import { useEffect } from "react";

/**
 * Watches for session-level errors (e.g. RefreshTokenError) and
 * redirects to sign-in when the token can no longer be refreshed.
 */
function SessionGuard({ children }: { children: ReactNode }) {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.error === "RefreshTokenError") {
      // Token refresh failed — force re-authentication
      signIn("discord");
    }
  }, [session?.error]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionGuard>{children}</SessionGuard>
    </SessionProvider>
  );
}
