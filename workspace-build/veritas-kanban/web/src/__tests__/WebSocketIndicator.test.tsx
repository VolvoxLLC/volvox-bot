/**
 * Tests for components/shared/WebSocketIndicator.tsx — status indicator states.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WebSocketStatusProvider } from '@/contexts/WebSocketContext';
import { WebSocketIndicator } from '@/components/shared/WebSocketIndicator';
import type { ConnectionState } from '@/hooks/useWebSocket';

// ── Helpers ──────────────────────────────────────────────────

function renderIndicator(connectionState: ConnectionState, reconnectAttempt = 0) {
  return render(
    <WebSocketStatusProvider
      isConnected={connectionState === 'connected'}
      connectionState={connectionState}
      reconnectAttempt={reconnectAttempt}
    >
      <WebSocketIndicator />
    </WebSocketStatusProvider>
  );
}

afterEach(() => {
  cleanup();
});

// ── Tests ────────────────────────────────────────────────────

describe('WebSocketIndicator', () => {
  it('shows connected state with green dot', () => {
    renderIndicator('connected');
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toBe('WebSocket connected');

    // Should have a green dot
    const dot = button.querySelector('span');
    expect(dot?.className).toContain('bg-green-500');
  });

  it('shows reconnecting state with yellow dot and attempt count', () => {
    renderIndicator('reconnecting', 3);
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toBe('WebSocket reconnecting (attempt 3)');

    // Should have a yellow pulsing dot
    const dot = button.querySelector('span');
    expect(dot?.className).toContain('bg-yellow-500');
    expect(dot?.className).toContain('animate-pulse');
  });

  it('shows connecting state with yellow dot', () => {
    renderIndicator('connecting', 0);
    const button = screen.getByRole('button');
    // connecting is treated the same as reconnecting visually
    expect(button.getAttribute('aria-label')).toContain('reconnecting');

    const dot = button.querySelector('span');
    expect(dot?.className).toContain('bg-yellow-500');
  });

  it('shows disconnected state with red dot', () => {
    renderIndicator('disconnected');
    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-label')).toBe('WebSocket disconnected');

    const dot = button.querySelector('span');
    expect(dot?.className).toContain('bg-red-500');
  });
});
