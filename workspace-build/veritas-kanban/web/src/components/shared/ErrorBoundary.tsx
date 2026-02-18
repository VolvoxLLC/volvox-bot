import React, { Component, type ReactNode } from 'react';
import { ErrorFallback, type ErrorLevel } from './ErrorFallback';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback element — overrides the default level-based fallback */
  fallback?: ReactNode;
  /** Callback fired when an error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Controls which default fallback UI to show */
  level?: ErrorLevel;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Fire optional callback
    this.props.onError?.(error, errorInfo);

    if (import.meta.env.DEV) {
      // Verbose logging in development
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    } else {
      // Structured logging for production — useful for future log aggregation
      console.error(
        JSON.stringify({
          type: 'error_boundary',
          level: this.props.level ?? 'section',
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
          timestamp: new Date().toISOString(),
        })
      );
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Custom fallback takes priority
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      const level = this.props.level ?? 'section';
      const error = this.state.error ?? new Error('Unknown error');

      return <ErrorFallback error={error} level={level} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
