"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Dashboard Error</CardTitle>
          <CardDescription>
            Something went wrong loading this page. Your session may have
            expired, or there was a temporary issue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Error ID: {error.digest}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={reset}>Try Again</Button>
            <Button variant="outline" asChild>
              <a href="/login">Sign In Again</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
