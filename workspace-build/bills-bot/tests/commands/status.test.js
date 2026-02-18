import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock health monitor
const healthMocks = vi.hoisted(() => ({
  monitor: {
    getStatus: vi.fn().mockReturnValue({
      uptime: 60000,
      uptimeFormatted: '1m 0s',
      memory: {
        heapUsed: 50,
        heapTotal: 100,
        rss: 120,
        external: 5,
        formatted: '50MB / 100MB (RSS: 120MB)',
      },
      api: { status: 'ok', lastCheck: Date.now() },
      lastAIRequest: Date.now() - 5000,
      timestamp: Date.now(),
    }),
    getDetailedStatus: vi.fn().mockReturnValue({
      uptime: 60000,
      uptimeFormatted: '1m 0s',
      memory: {
        heapUsed: 50,
        heapTotal: 100,
        rss: 120,
        external: 5,
        arrayBuffers: 2,
        formatted: '50MB / 100MB (RSS: 120MB)',
      },
      api: { status: 'ok', lastCheck: Date.now() },
      lastAIRequest: Date.now() - 5000,
      timestamp: Date.now(),
      process: {
        pid: 1234,
        platform: 'linux',
        nodeVersion: 'v22.0.0',
        uptime: 60,
      },
      cpu: { user: 1000, system: 500 },
    }),
  },
}));

vi.mock('../../src/utils/health.js', () => ({
  HealthMonitor: {
    getInstance: vi.fn().mockReturnValue(healthMocks.monitor),
  },
}));

import { data, execute } from '../../src/commands/status.js';

describe('status command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with name', () => {
    expect(data.name).toBe('status');
  });

  it('should show basic status', async () => {
    const mockReply = vi.fn();
    const interaction = {
      options: { getBoolean: vi.fn().mockReturnValue(false) },
      reply: mockReply,
    };

    await execute(interaction);
    expect(mockReply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));

    // Verify the 'ok' status produces the green emoji
    const embed = mockReply.mock.calls[0][0].embeds[0];
    const apiField = embed.data.fields.find((f) => f.name.includes('API'));
    expect(apiField.value).toContain('🟢');
  });

  it('should deny non-admin from detailed view', async () => {
    const mockReply = vi.fn();
    const interaction = {
      options: { getBoolean: vi.fn().mockReturnValue(true) },
      memberPermissions: { has: vi.fn().mockReturnValue(false) },
      reply: mockReply,
    };

    await execute(interaction);
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('administrators'),
        ephemeral: true,
      }),
    );
  });

  it('should show detailed status for admin', async () => {
    const mockReply = vi.fn();
    const interaction = {
      options: { getBoolean: vi.fn().mockReturnValue(true) },
      memberPermissions: { has: vi.fn().mockReturnValue(true) },
      reply: mockReply,
    };

    await execute(interaction);
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
        ephemeral: true,
      }),
    );
  });

  it('should handle errors with reply', async () => {
    const mockReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      options: {
        getBoolean: vi.fn().mockImplementation(() => {
          throw new Error('test error');
        }),
      },
      replied: false,
      deferred: false,
      reply: mockReply,
      followUp: vi.fn(),
    };

    await execute(interaction);
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("couldn't retrieve"),
        ephemeral: true,
      }),
    );
  });

  it('should handle errors with followUp when already replied', async () => {
    const mockFollowUp = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      options: {
        getBoolean: vi.fn().mockImplementation(() => {
          throw new Error('test error');
        }),
      },
      replied: true,
      deferred: false,
      reply: vi.fn(),
      followUp: mockFollowUp,
    };

    await execute(interaction);
    expect(mockFollowUp).toHaveBeenCalled();
  });

  it('should handle null memberPermissions for detailed view', async () => {
    const mockReply = vi.fn();
    const interaction = {
      options: { getBoolean: vi.fn().mockReturnValue(true) },
      memberPermissions: null,
      reply: mockReply,
    };

    await execute(interaction);
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('administrators'),
        ephemeral: true,
      }),
    );
  });

  describe('formatRelativeTime branches', () => {
    /** Helper: extract the 'Last AI Request' field value from the reply embed */
    function getLastAIRequestField(mockReply) {
      const embed = mockReply.mock.calls[0][0].embeds[0];
      const field = embed.data.fields.find((f) => f.name.includes('Last AI Request'));
      return field?.value;
    }

    it('should show "Never" when lastAIRequest is null', async () => {
      healthMocks.monitor.getStatus.mockReturnValueOnce({
        uptime: 60000,
        uptimeFormatted: '1m 0s',
        memory: { heapUsed: 50, heapTotal: 100, rss: 120, external: 5, formatted: '50MB' },
        api: { status: 'ok', lastCheck: Date.now() },
        lastAIRequest: null,
        timestamp: Date.now(),
      });
      const mockReply = vi.fn();
      const interaction = {
        options: { getBoolean: vi.fn().mockReturnValue(false) },
        reply: mockReply,
      };
      await execute(interaction);
      expect(mockReply).toHaveBeenCalled();
      expect(getLastAIRequestField(mockReply)).toBe('Never');
    });

    it('should show "Just now" when lastAIRequest is within 1 second', async () => {
      healthMocks.monitor.getStatus.mockReturnValueOnce({
        uptime: 60000,
        uptimeFormatted: '1m 0s',
        memory: { heapUsed: 50, heapTotal: 100, rss: 120, external: 5, formatted: '50MB' },
        api: { status: 'ok', lastCheck: Date.now() },
        lastAIRequest: Date.now(),
        timestamp: Date.now(),
      });
      const mockReply = vi.fn();
      const interaction = {
        options: { getBoolean: vi.fn().mockReturnValue(false) },
        reply: mockReply,
      };
      await execute(interaction);
      expect(mockReply).toHaveBeenCalled();
      expect(getLastAIRequestField(mockReply)).toBe('Just now');
    });

    it('should show minutes ago when lastAIRequest is minutes old', async () => {
      healthMocks.monitor.getStatus.mockReturnValueOnce({
        uptime: 60000,
        uptimeFormatted: '1m 0s',
        memory: { heapUsed: 50, heapTotal: 100, rss: 120, external: 5, formatted: '50MB' },
        api: { status: 'ok', lastCheck: Date.now() },
        lastAIRequest: Date.now() - 300000, // 5 minutes ago
        timestamp: Date.now(),
      });
      const mockReply = vi.fn();
      const interaction = {
        options: { getBoolean: vi.fn().mockReturnValue(false) },
        reply: mockReply,
      };
      await execute(interaction);
      expect(mockReply).toHaveBeenCalled();
      expect(getLastAIRequestField(mockReply)).toBe('5m ago');
    });

    it('should show hours ago when lastAIRequest is hours old', async () => {
      healthMocks.monitor.getStatus.mockReturnValueOnce({
        uptime: 60000,
        uptimeFormatted: '1m 0s',
        memory: { heapUsed: 50, heapTotal: 100, rss: 120, external: 5, formatted: '50MB' },
        api: { status: 'ok', lastCheck: Date.now() },
        lastAIRequest: Date.now() - 7200000, // 2 hours ago
        timestamp: Date.now(),
      });
      const mockReply = vi.fn();
      const interaction = {
        options: { getBoolean: vi.fn().mockReturnValue(false) },
        reply: mockReply,
      };
      await execute(interaction);
      expect(mockReply).toHaveBeenCalled();
      expect(getLastAIRequestField(mockReply)).toBe('2h ago');
    });

    it('should show days ago when lastAIRequest is days old', async () => {
      healthMocks.monitor.getStatus.mockReturnValueOnce({
        uptime: 60000,
        uptimeFormatted: '1m 0s',
        memory: { heapUsed: 50, heapTotal: 100, rss: 120, external: 5, formatted: '50MB' },
        api: { status: 'ok', lastCheck: Date.now() },
        lastAIRequest: Date.now() - 172800000, // 2 days ago
        timestamp: Date.now(),
      });
      const mockReply = vi.fn();
      const interaction = {
        options: { getBoolean: vi.fn().mockReturnValue(false) },
        reply: mockReply,
      };
      await execute(interaction);
      expect(mockReply).toHaveBeenCalled();
      expect(getLastAIRequestField(mockReply)).toBe('2d ago');
    });
  });

  describe('getStatusEmoji branches', () => {
    /** Helper: extract the 'API Status' field value from the reply embed */
    function getAPIStatusField(mockReply) {
      const embed = mockReply.mock.calls[0][0].embeds[0];
      const field = embed.data.fields.find((f) => f.name.includes('API'));
      return field?.value;
    }

    it('should show error emoji for error status', async () => {
      healthMocks.monitor.getStatus.mockReturnValueOnce({
        uptime: 60000,
        uptimeFormatted: '1m 0s',
        memory: { heapUsed: 50, heapTotal: 100, rss: 120, external: 5, formatted: '50MB' },
        api: { status: 'error', lastCheck: Date.now() },
        lastAIRequest: Date.now() - 5000,
        timestamp: Date.now(),
      });
      const mockReply = vi.fn();
      const interaction = {
        options: { getBoolean: vi.fn().mockReturnValue(false) },
        reply: mockReply,
      };
      await execute(interaction);
      expect(mockReply).toHaveBeenCalled();
      expect(getAPIStatusField(mockReply)).toContain('🔴');
    });

    it('should show unknown emoji for unknown status', async () => {
      healthMocks.monitor.getStatus.mockReturnValueOnce({
        uptime: 60000,
        uptimeFormatted: '1m 0s',
        memory: { heapUsed: 50, heapTotal: 100, rss: 120, external: 5, formatted: '50MB' },
        api: { status: 'unknown', lastCheck: Date.now() },
        lastAIRequest: Date.now() - 5000,
        timestamp: Date.now(),
      });
      const mockReply = vi.fn();
      const interaction = {
        options: { getBoolean: vi.fn().mockReturnValue(false) },
        reply: mockReply,
      };
      await execute(interaction);
      expect(mockReply).toHaveBeenCalled();
      expect(getAPIStatusField(mockReply)).toContain('🟡');
    });

    it('should show default emoji for unrecognized status', async () => {
      healthMocks.monitor.getStatus.mockReturnValueOnce({
        uptime: 60000,
        uptimeFormatted: '1m 0s',
        memory: { heapUsed: 50, heapTotal: 100, rss: 120, external: 5, formatted: '50MB' },
        api: { status: 'maintenance', lastCheck: Date.now() },
        lastAIRequest: Date.now() - 5000,
        timestamp: Date.now(),
      });
      const mockReply = vi.fn();
      const interaction = {
        options: { getBoolean: vi.fn().mockReturnValue(false) },
        reply: mockReply,
      };
      await execute(interaction);
      expect(mockReply).toHaveBeenCalled();
      expect(getAPIStatusField(mockReply)).toContain('⚪');
    });
  });

  it('should handle error when followUp also fails', async () => {
    const interaction = {
      options: {
        getBoolean: vi.fn().mockImplementation(() => {
          throw new Error('test error');
        }),
      },
      replied: true,
      deferred: false,
      reply: vi.fn(),
      followUp: vi.fn().mockRejectedValue(new Error('followUp failed')),
    };

    // Should not throw even when followUp rejects
    await execute(interaction);
    expect(interaction.followUp).toHaveBeenCalled();
  });

  it('should handle error when reply also fails', async () => {
    const interaction = {
      options: {
        getBoolean: vi.fn().mockImplementation(() => {
          throw new Error('test error');
        }),
      },
      replied: false,
      deferred: false,
      reply: vi.fn().mockRejectedValue(new Error('reply failed')),
      followUp: vi.fn(),
    };

    // Should not throw even when reply rejects
    await execute(interaction);
    expect(interaction.reply).toHaveBeenCalled();
  });
});
