"use client";

import { useEffect } from "react";
import { logger } from "@/lib/logger";

/**
 * Root-level error boundary for Next.js App Router.
 * This catches errors that propagate past the root layout,
 * so it must render its own <html> and <body> tags.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("[global-error-boundary]", error);
  }, [error]);

  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: "system-ui, sans-serif", color: "#f3f4f6", background: "#111827" }}>
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
              Something went wrong
            </h2>
            <p style={{ color: "#9ca3af", marginBottom: "1rem" }}>
              A critical error occurred. Please try again.
            </p>
            {error.digest && (
              <p style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "1rem" }}>
                Error ID: {error.digest}
              </p>
            )}
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.375rem",
                border: "1px solid #4b5563",
                background: "#1f2937",
                color: "#f3f4f6",
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
