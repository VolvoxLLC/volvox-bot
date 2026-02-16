"use client";

import { SessionProvider, useSession, signIn } from "next-auth/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

/**
 * Watches for session-level errors (e.g. RefreshTokenError) and
 * redirects to sign-in when the token can no longer be refreshed.
 */
function SessionGuard({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const signingIn = useRef(false);

  useEffect(() => {
    if (session?.error === "RefreshTokenError" && !signingIn.current) {
      signingIn.current = true;
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
