import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks must be hoisted before imports
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn(),
}));

import { getPool } from '../../src/db.js';
import { info, error as logError, warn } from '../../src/logger.js';
import { getConfig } from '../../src/modules/config.js';
import {
  deliverToEndpoint,
  fireEvent,
  getDeliveryLog,
  signPayload,
  testEndpoint,
  WEBHOOK_EVENTS,
} from '../../src/modules/webhookNotifier.js';

describe('webhookNotifier', () => {
  let mockFetch;
  let mockPool;
  let originalFetch;

  beforeEach(() => {
    vi.clearAllMocks();

    // Save original fetch before any mocks
    originalFetch = global.fetch;

    mockPool = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    getPool.mockReturnValue(mockPool);

    // Default: no webhooks configured
    getConfig.mockReturnValue({ notifications: { webhooks: [] } });

    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Restore original fetch instead of deleting
    global.fetch = originalFetch;
  });

  // ── signPayload ──────────────────────────────────────────────────────────

  describe('signPayload', () => {
    it('should return sha256= prefixed HMAC hex', () => {
      const sig = signPayload('mysecret', '{"hello":"world"}');
      expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should produce consistent signatures for same inputs', () => {
      const body = '{"event":"test"}';
      expect(signPayload('secret', body)).toBe(signPayload('secret', body));
    });

    it('should produce different signatures for different secrets', () => {
      const body = '{"event":"test"}';
      expect(signPayload('secret1', body)).not.toBe(signPayload('secret2', body));
    });
  });

  // ── WEBHOOK_EVENTS ───────────────────────────────────────────────────────

  describe('WEBHOOK_EVENTS', () => {
    it('should include all required event types', () => {
      const required = [
        'bot.disconnected',
        'bot.reconnected',
        'bot.error',
        'moderation.action',
        'health.degraded',
        'config.changed',
        'member.flagged',
      ];
      for (const evt of required) {
        expect(WEBHOOK_EVENTS).toContain(evt);
      }
    });
  });

  // ── deliverToEndpoint ────────────────────────────────────────────────────

  describe('deliverToEndpoint', () => {
    const endpoint = {
      id: 'ep1',
      url: 'https://example.com/hook',
      secret: 'mysecret',
    };
    const payload = {
      event: 'test',
      timestamp: '2026-01-01T00:00:00Z',
      guild_id: 'guild1',
      data: {},
    };

    it('should deliver successfully on first attempt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const result = await deliverToEndpoint('guild1', endpoint, payload);
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith(
        'Webhook delivered',
        expect.objectContaining({
          guildId: 'guild1',
          endpointId: 'ep1',
          attempt: 1,
        }),
      );
    });

    it('should include HMAC signature header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      await deliverToEndpoint('guild1', endpoint, payload);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('https://example.com/hook');
      expect(opts.headers['X-Signature-256']).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should omit signature header when no secret', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const epNoSecret = { id: 'ep2', url: 'https://example.com/hook' };
      await deliverToEndpoint('guild1', epNoSecret, payload);

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers['X-Signature-256']).toBeUndefined();
    });

    it('should retry on failure with exponential backoff', async () => {
      vi.useFakeTimers();

      // Fail twice, succeed on 3rd attempt
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Error' })
        .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'Unavailable' })
        .mockResolvedValueOnce({ ok: true, status: 200, text: async () => 'OK' });

      const deliverPromise = deliverToEndpoint('guild1', endpoint, payload);

      // Advance through retry delays
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(3000);

      const result = await deliverPromise;
      vi.useRealTimers();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should return false after all retries exhausted', async () => {
      vi.useFakeTimers();

      mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'Error' });

      const deliverPromise = deliverToEndpoint('guild1', endpoint, payload);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(9000);

      const result = await deliverPromise;
      vi.useRealTimers();

      expect(result).toBe(false);
      expect(logError).toHaveBeenCalledWith(
        'Webhook delivery failed after all retries',
        expect.any(Object),
      );
    });

    it('should handle network errors (fetch throws)', async () => {
      vi.useFakeTimers();

      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const deliverPromise = deliverToEndpoint('guild1', endpoint, payload);

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(9000);

      const result = await deliverPromise;
      vi.useRealTimers();

      expect(result).toBe(false);
    });

    it('should log each attempt to delivery log', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      await deliverToEndpoint('guild1', endpoint, payload);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO webhook_delivery_log'),
        expect.arrayContaining(['guild1', 'ep1', 'test']),
      );
    });

    it('should prune old log entries after each delivery', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      await deliverToEndpoint('guild1', endpoint, payload);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM webhook_delivery_log'),
        ['guild1', 100],
      );
    });

    it('should work without a DB pool (no pool configured)', async () => {
      getPool.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const result = await deliverToEndpoint('guild1', endpoint, payload);
      expect(result).toBe(true);
    });

    it('should handle DB logging errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB error'));
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'OK',
      });

      const result = await deliverToEndpoint('guild1', endpoint, payload);
      expect(result).toBe(true);
      expect(warn).toHaveBeenCalledWith('Failed to log webhook delivery', expect.any(Object));
    });
  });

  // ── fireEvent ────────────────────────────────────────────────────────────

  describe('fireEvent', () => {
    it('should not fire when no webhooks configured', async () => {
      getConfig.mockReturnValue({ notifications: { webhooks: [] } });
      await fireEvent('bot.error', 'guild1', { message: 'oops' });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not fire when notifications not in config', async () => {
      getConfig.mockReturnValue({});
      await fireEvent('bot.error', 'guild1', {});
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fire to endpoints subscribed to the event', async () => {
      getConfig.mockReturnValue({
        notifications: {
          webhooks: [
            { id: 'ep1', url: 'https://example.com/hook', events: ['bot.error'], enabled: true },
          ],
        },
      });
      mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'OK' });

      await fireEvent('bot.error', 'guild1', { message: 'crash' });
      // Give microtasks time to settle
      await new Promise((r) => setTimeout(r, 0));

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not fire to endpoints not subscribed to the event', async () => {
      getConfig.mockReturnValue({
        notifications: {
          webhooks: [
            {
              id: 'ep1',
              url: 'https://example.com/hook',
              events: ['moderation.action'],
              enabled: true,
            },
          ],
        },
      });

      await fireEvent('bot.error', 'guild1', {});
      await new Promise((r) => setTimeout(r, 0));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not fire to disabled endpoints', async () => {
      getConfig.mockReturnValue({
        notifications: {
          webhooks: [
            { id: 'ep1', url: 'https://example.com/hook', events: ['bot.error'], enabled: false },
          ],
        },
      });

      await fireEvent('bot.error', 'guild1', {});
      await new Promise((r) => setTimeout(r, 0));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fire to multiple subscribed endpoints', async () => {
      getConfig.mockReturnValue({
        notifications: {
          webhooks: [
            { id: 'ep1', url: 'https://a.com/hook', events: ['bot.error'], enabled: true },
            { id: 'ep2', url: 'https://b.com/hook', events: ['bot.error'], enabled: true },
          ],
        },
      });
      mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'OK' });

      await fireEvent('bot.error', 'guild1', {});
      await new Promise((r) => setTimeout(r, 0));

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should include structured payload with event/timestamp/guild_id', async () => {
      getConfig.mockReturnValue({
        notifications: {
          webhooks: [
            {
              id: 'ep1',
              url: 'https://example.com/hook',
              events: ['moderation.action'],
              enabled: true,
            },
          ],
        },
      });
      mockFetch.mockResolvedValue({ ok: true, status: 200, text: async () => 'OK' });

      await fireEvent('moderation.action', 'guild1', { action: 'ban' });
      await new Promise((r) => setTimeout(r, 0));

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.event).toBe('moderation.action');
      expect(body.guild_id).toBe('guild1');
      expect(body.data.action).toBe('ban');
      expect(body.timestamp).toBeTruthy();
    });

    it('should handle config errors gracefully (returns without firing)', async () => {
      getConfig.mockImplementation(() => {
        throw new Error('config not loaded');
      });
      await expect(fireEvent('bot.error', 'guild1', {})).resolves.not.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ── getDeliveryLog ───────────────────────────────────────────────────────

  describe('getDeliveryLog', () => {
    it('should query the delivery log for a guild', async () => {
      const rows = [
        {
          id: 1,
          endpoint_id: 'ep1',
          event_type: 'bot.error',
          status: 'success',
          attempt: 1,
          delivered_at: '2026-01-01',
        },
      ];
      mockPool.query.mockResolvedValueOnce({ rows });

      const result = await getDeliveryLog('guild1');
      expect(result).toEqual(rows);
      expect(mockPool.query).toHaveBeenCalledWith(expect.stringContaining('SELECT'), [
        'guild1',
        50,
      ]);
    });

    it('should return empty array when no pool', async () => {
      getPool.mockReturnValue(null);
      const result = await getDeliveryLog('guild1');
      expect(result).toEqual([]);
    });

    it('should cap limit at 100', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await getDeliveryLog('guild1', 9999);
      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['guild1', 100]);
    });

    it('should default limit to 50', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await getDeliveryLog('guild1');
      expect(mockPool.query).toHaveBeenCalledWith(expect.any(String), ['guild1', 50]);
    });
  });

  // ── testEndpoint ─────────────────────────────────────────────────────────

  describe('testEndpoint', () => {
    it('should send a test payload and return result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'received',
      });

      const endpoint = { id: 'ep1', url: 'https://example.com/hook', secret: 'sec' };
      const result = await testEndpoint('guild1', endpoint);

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.text).toBe('received');

      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.event).toBe('test');
      expect(body.data.message).toBeTruthy();
    });

    it('should return failure result on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('connection refused'));
      const endpoint = { id: 'ep1', url: 'https://example.com/hook' };
      const result = await testEndpoint('guild1', endpoint);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(0);
    });
  });
});
