'use client';

import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ErrorBoundaryProps {
  /** Content to render when there is no error. */
  children: ReactNode;
  /**
   * Optional custom fallback UI. When provided, replaces the default error card.
   * Receives the caught error and a reset function.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Optional title shown in the default error UI. */
  title?: string;
  /** Optional description shown in the default error UI. */
  description?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * A reusable React error boundary that catches rendering errors in its subtree
 * and displays a friendly error card with a "Try Again" retry button.
 *
 * @example
 * ```tsx
 * <ErrorBoundary title="Members failed to load">
 *   <MemberTable ... />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in dev; in prod this surfaces in your error monitoring
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback, title, description } = this.props;

    if (error) {
      if (fallback) {
        return fallback(error, this.reset);
      }

      return (
        <div className="flex items-center justify-center p-6">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle className="text-xl">{title ?? 'Something went wrong'}</CardTitle>
              <CardDescription>
                {description ??
                  'An unexpected error occurred. Try again or refresh the page.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              {process.env.NODE_ENV === 'development' && (
                <p className="max-w-sm break-words text-center text-xs text-muted-foreground">
                  {error.message}
                </p>
              )}
              <Button onClick={this.reset}>Try Again</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return children;
  }
}
