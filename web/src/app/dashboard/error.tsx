"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/error-card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard-error-boundary]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center p-8">
      <ErrorCard
        title="Dashboard Error"
        description="Something went wrong loading this page. Your session may have expired, or there was a temporary issue."
        digest={error.digest}
        actions={
          <div className="flex gap-2">
            <Button onClick={reset}>Try Again</Button>
            <Button variant="outline" asChild>
              <a href="/login">Sign In Again</a>
            </Button>
          </div>
        }
      />
    </div>
  );
}
