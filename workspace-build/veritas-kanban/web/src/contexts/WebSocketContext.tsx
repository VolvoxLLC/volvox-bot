import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ConnectionState } from '@/hooks/useWebSocket';

interface WebSocketStatus {
  /** Whether the WebSocket is currently connected */
  isConnected: boolean;
  /** Detailed connection state */
  connectionState: ConnectionState;
  /** Current reconnect attempt (0 when connected or idle) */
  reconnectAttempt: number;
}

const WebSocketStatusContext = createContext<WebSocketStatus>({
  isConnected: false,
  connectionState: 'disconnected',
  reconnectAttempt: 0,
});

export function WebSocketStatusProvider({
  children,
  isConnected,
  connectionState,
  reconnectAttempt,
}: {
  children: ReactNode;
  isConnected: boolean;
  connectionState: ConnectionState;
  reconnectAttempt: number;
}) {
  const value = useMemo(
    () => ({ isConnected, connectionState, reconnectAttempt }),
    [isConnected, connectionState, reconnectAttempt]
  );

  return (
    <WebSocketStatusContext.Provider value={value}>{children}</WebSocketStatusContext.Provider>
  );
}

/**
 * Returns the current WebSocket connection status.
 * Used by data-fetching hooks to adjust polling intervals:
 * - Connected: reduce polling (WS handles real-time updates)
 * - Disconnected: increase polling as fallback
 */
export function useWebSocketStatus(): WebSocketStatus {
  return useContext(WebSocketStatusContext);
}
