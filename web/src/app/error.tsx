"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/error-card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to an error reporting service in production
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <ErrorCard
        title="Something went wrong"
        description="An unexpected error occurred. Please try again."
        digest={error.digest}
        actions={<Button onClick={reset}>Try Again</Button>}
      />
    </div>
  );
}
