'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { ErrorCard } from '@/components/error-card';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';

/**
 * Renders a centered error UI and reports the provided error.
 *
 * Logs the error and sends it to Sentry when the component mounts and whenever `error` changes.
 *
 * @param error - The caught `Error` object; may include an optional `digest` string shown in the UI.
 * @param reset - Callback invoked when the user requests a retry (e.g., clicking "Try Again").
 * @returns The JSX element that displays the error card and retry action.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('[error-boundary]', error);
    Sentry.captureException(error);
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
