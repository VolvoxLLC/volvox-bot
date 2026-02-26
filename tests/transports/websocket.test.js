import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketTransport } from '../../src/transports/websocket.js';

/**
 * Create a mock WebSocket client.
 */
function createMockWs(readyState = 1) {
  return {
    readyState,
    logFilter: null,
    send: vi.fn(),
  };
}

describe('WebSocketTransport', () => {
  let transport;

  beforeEach(() => {
    transport = new WebSocketTransport({ level: 'debug' });
  });

  afterEach(() => {
    transport.close();
  });

  describe('constructor', () => {
    it('should initialize with an empty client set', () => {
      expect(transport.clients.size).toBe(0);
    });
  });

  describe('addClient / removeClient', () => {
    it('should add a client', () => {
      const ws = createMockWs();
      transport.addClient(ws);
      expect(transport.clients.size).toBe(1);
    });

    it('should remove a client', () => {
      const ws = createMockWs();
      transport.addClient(ws);
      transport.removeClient(ws);
      expect(transport.clients.size).toBe(0);
    });

    it('should not error when removing a non-existent client', () => {
      const ws = createMockWs();
      expect(() => transport.removeClient(ws)).not.toThrow();
    });
  });

  describe('log', () => {
    it('should call callback immediately when no clients connected', () => {
      const callback = vi.fn();
      transport.log({ level: 'info', message: 'test' }, callback);
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should broadcast to connected authenticated clients', () => {
      const ws = createMockWs();
      transport.addClient(ws);

      const callback = vi.fn();
      transport.log(
        { level: 'info', message: 'hello world', timestamp: '2026-01-01T00:00:00Z' },
        callback,
      );

      expect(ws.send).toHaveBeenCalledOnce();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.type).toBe('log');
      expect(sent.level).toBe('info');
      expect(sent.message).toBe('hello world');
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should not send to clients with closed connections', () => {
      const ws = createMockWs(3); // CLOSED state
      transport.addClient(ws);

      const callback = vi.fn();
      transport.log({ level: 'info', message: 'test' }, callback);

      expect(ws.send).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should broadcast to multiple clients', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      transport.addClient(ws1);
      transport.addClient(ws2);

      transport.log({ level: 'info', message: 'test' }, vi.fn());

      expect(ws1.send).toHaveBeenCalledOnce();
      expect(ws2.send).toHaveBeenCalledOnce();
    });

    it('should handle send errors gracefully', () => {
      const ws = createMockWs();
      ws.send.mockImplementation(() => {
        throw new Error('send failed');
      });
      transport.addClient(ws);

      const callback = vi.fn();
      expect(() => transport.log({ level: 'info', message: 'test' }, callback)).not.toThrow();
      expect(callback).toHaveBeenCalledOnce();
    });

    it('should extract metadata from info object', () => {
      const ws = createMockWs();
      transport.addClient(ws);

      transport.log(
        {
          level: 'info',
          message: 'test',
          timestamp: '2026-01-01T00:00:00Z',
          module: 'api',
          userId: '123',
        },
        vi.fn(),
      );

      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.metadata.module).toBe('api');
      expect(sent.metadata.userId).toBe('123');
      expect(sent.module).toBe('api');
    });

    it('should handle non-serializable metadata', () => {
      const ws = createMockWs();
      transport.addClient(ws);

      const circular = {};
      circular.self = circular;

      transport.log(
        {
          level: 'info',
          message: 'test',
          timestamp: '2026-01-01T00:00:00Z',
          data: circular,
        },
        vi.fn(),
      );

      // Should still send — falls back to empty metadata
      expect(ws.send).toHaveBeenCalledOnce();
      const sent = JSON.parse(ws.send.mock.calls[0][0]);
      expect(sent.metadata).toEqual({});
    });
  });

  describe('passesFilter', () => {
    it('should pass all entries when no filter is set', () => {
      const result = transport.passesFilter({ level: 'debug', message: 'test' }, null);
      expect(result).toBe(true);
    });

    it('should filter by level severity', () => {
      const filter = { level: 'warn' };

      expect(transport.passesFilter({ level: 'error', message: 'test' }, filter)).toBe(true);
      expect(transport.passesFilter({ level: 'warn', message: 'test' }, filter)).toBe(true);
      expect(transport.passesFilter({ level: 'info', message: 'test' }, filter)).toBe(false);
      expect(transport.passesFilter({ level: 'debug', message: 'test' }, filter)).toBe(false);
    });

    it('should filter by module', () => {
      const filter = { module: 'api' };

      expect(
        transport.passesFilter({ level: 'info', message: 'test', module: 'api' }, filter),
      ).toBe(true);
      expect(
        transport.passesFilter({ level: 'info', message: 'test', module: 'bot' }, filter),
      ).toBe(false);
    });

    it('should filter by search (case-insensitive)', () => {
      const filter = { search: 'ERROR' };

      expect(transport.passesFilter({ level: 'info', message: 'An error occurred' }, filter)).toBe(
        true,
      );
      expect(transport.passesFilter({ level: 'info', message: 'All good' }, filter)).toBe(false);
    });

    it('should combine multiple filters with AND logic', () => {
      const filter = { level: 'warn', module: 'api' };

      // Passes both
      expect(
        transport.passesFilter({ level: 'error', message: 'test', module: 'api' }, filter),
      ).toBe(true);
      // Fails level
      expect(
        transport.passesFilter({ level: 'info', message: 'test', module: 'api' }, filter),
      ).toBe(false);
      // Fails module
      expect(
        transport.passesFilter({ level: 'error', message: 'test', module: 'bot' }, filter),
      ).toBe(false);
    });

    it('should apply per-client filters during broadcast', () => {
      const wsAll = createMockWs();
      wsAll.logFilter = null; // No filter — gets everything

      const wsErrorOnly = createMockWs();
      wsErrorOnly.logFilter = { level: 'error' };

      transport.addClient(wsAll);
      transport.addClient(wsErrorOnly);

      // Send an info-level log
      transport.log(
        { level: 'info', message: 'info msg', timestamp: '2026-01-01T00:00:00Z' },
        vi.fn(),
      );

      expect(wsAll.send).toHaveBeenCalledOnce();
      expect(wsErrorOnly.send).not.toHaveBeenCalled();

      // Send an error-level log
      transport.log(
        { level: 'error', message: 'error msg', timestamp: '2026-01-01T00:00:00Z' },
        vi.fn(),
      );

      expect(wsAll.send).toHaveBeenCalledTimes(2);
      expect(wsErrorOnly.send).toHaveBeenCalledOnce();
    });
  });

  describe('close', () => {
    it('should clear all clients', () => {
      transport.addClient(createMockWs());
      transport.addClient(createMockWs());

      transport.close();
      expect(transport.clients.size).toBe(0);
    });
  });
});
