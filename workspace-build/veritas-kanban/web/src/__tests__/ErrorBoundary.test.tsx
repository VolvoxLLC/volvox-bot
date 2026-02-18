/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';

// ── Helpers ──────────────────────────────────────────────────

/** A component that throws on render */
function ThrowingChild({ message = 'Test explosion' }: { message?: string }): React.ReactNode {
  throw new Error(message);
}

/** A perfectly normal child */
function GoodChild() {
  return <div>All good here</div>;
}

// Suppress React's own error boundary console noise during tests
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ── Tests ────────────────────────────────────────────────────

describe('ErrorBoundary', () => {
  // 1. Children render normally when no error
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('All good here')).toBeDefined();
  });

  // 2. Section-level fallback when child throws (default level)
  it('shows section fallback when a child throws', () => {
    render(
      <ErrorBoundary level="section">
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('This section encountered an error')).toBeDefined();
    expect(screen.getByText('Retry')).toBeDefined();
  });

  // 3. Page-level fallback
  it('shows page fallback when level is "page"', () => {
    render(
      <ErrorBoundary level="page">
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeDefined();
    expect(screen.getByText('Reload')).toBeDefined();
  });

  // 4. Widget-level fallback
  it('shows widget fallback when level is "widget"', () => {
    render(
      <ErrorBoundary level="widget">
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Failed to render')).toBeDefined();
    expect(screen.getByText('Retry')).toBeDefined();
  });

  // 5. Retry resets the boundary
  it('resets state and re-renders children when retry is clicked', () => {
    let shouldThrow = true;

    function ConditionalChild(): React.ReactNode {
      if (shouldThrow) {
        throw new Error('Boom');
      }
      return <div>Recovered!</div>;
    }

    render(
      <ErrorBoundary level="section">
        <ConditionalChild />
      </ErrorBoundary>
    );

    // Should show fallback first
    expect(screen.getByText('This section encountered an error')).toBeDefined();

    // Fix the child, then retry
    shouldThrow = false;
    fireEvent.click(screen.getByText('Retry'));

    // Should now render the child
    expect(screen.getByText('Recovered!')).toBeDefined();
  });

  // 6. Widget-level retry also works
  it('resets widget-level boundary on retry', () => {
    let shouldThrow = true;

    function ConditionalChild(): React.ReactNode {
      if (shouldThrow) {
        throw new Error('Widget boom');
      }
      return <div>Widget recovered</div>;
    }

    render(
      <ErrorBoundary level="widget">
        <ConditionalChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Failed to render')).toBeDefined();

    shouldThrow = false;
    fireEvent.click(screen.getByText('Retry'));

    expect(screen.getByText('Widget recovered')).toBeDefined();
  });

  // 7. Custom fallback
  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error UI')).toBeDefined();
    // Default section fallback should NOT show
    expect(screen.queryByText('This section encountered an error')).toBeNull();
  });

  // 8. onError callback fires
  it('calls onError callback with error and errorInfo', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingChild message="callback test" />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'callback test' }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  // 9. Default level is section
  it('defaults to section-level fallback when no level specified', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>
    );

    expect(screen.getByText('This section encountered an error')).toBeDefined();
  });
});
