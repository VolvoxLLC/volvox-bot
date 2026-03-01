import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    permissions: { botOwners: ['owner-123'] },
  }),
  loadConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/modules/optout.js', () => ({
  loadOptOuts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/triage.js', () => ({
  startTriage: vi.fn().mockResolvedValue(undefined),
  stopTriage: vi.fn(),
}));

vi.mock('../../src/utils/health.js', () => ({
  HealthMonitor: {
    getInstance: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('../../src/utils/loadCommands.js', () => ({
  loadCommandsFromDirectory: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/utils/permissions.js', () => ({
  isBotOwner: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/utils/registerCommands.js', () => ({
  registerCommands: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: vi.fn().mockResolvedValue(undefined),
  safeEditReply: vi.fn().mockResolvedValue(undefined),
}));

import { adminOnly, data, execute } from '../../src/commands/reload.js';
import { loadConfig } from '../../src/modules/config.js';
import { loadOptOuts } from '../../src/modules/optout.js';
import { startTriage, stopTriage } from '../../src/modules/triage.js';
import { loadCommandsFromDirectory } from '../../src/utils/loadCommands.js';
import { isBotOwner } from '../../src/utils/permissions.js';
import { registerCommands } from '../../src/utils/registerCommands.js';
import { safeEditReply, safeReply } from '../../src/utils/safeSend.js';

function mockInteraction(overrides = {}) {
  return {
    member: { id: 'owner-123' },
    user: { id: 'owner-123', tag: 'owner#0001' },
    guildId: 'guild-1',
    deferReply: vi.fn().mockResolvedValue(undefined),
    client: {
      commands: new Map(),
      user: { id: 'bot-123' },
    },
    ...overrides,
  };
}

describe('reload command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with name "reload"', () => {
    expect(data.name).toBe('reload');
  });

  it('should export adminOnly = true', () => {
    expect(adminOnly).toBe(true);
  });

  it('should reject non-bot-owners', async () => {
    isBotOwner.mockReturnValueOnce(false);
    const interaction = mockInteraction();

    await execute(interaction);

    expect(safeReply).toHaveBeenCalledWith(interaction, {
      content: expect.stringContaining('restricted to bot owners'),
      ephemeral: true,
    });
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it('should reload all subsystems successfully', async () => {
    const interaction = mockInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(loadConfig).toHaveBeenCalled();
    expect(loadCommandsFromDirectory).toHaveBeenCalled();
    expect(registerCommands).toHaveBeenCalled();
    expect(stopTriage).toHaveBeenCalled();
    expect(startTriage).toHaveBeenCalled();
    expect(loadOptOuts).toHaveBeenCalled();

    expect(safeEditReply).toHaveBeenCalledTimes(1);
    const embedData = safeEditReply.mock.calls[0][1].embeds[0].data;
    expect(embedData.color).toBe(0x57f287);
  });

  it('should continue and show yellow embed when a step fails', async () => {
    loadConfig.mockRejectedValueOnce(new Error('DB timeout'));
    const interaction = mockInteraction();

    await execute(interaction);

    // Other steps should still run despite loadConfig failure
    expect(loadCommandsFromDirectory).toHaveBeenCalled();
    expect(registerCommands).toHaveBeenCalled();
    expect(stopTriage).toHaveBeenCalled();
    expect(startTriage).toHaveBeenCalled();
    expect(loadOptOuts).toHaveBeenCalled();

    expect(safeEditReply).toHaveBeenCalledTimes(1);
    const embedData = safeEditReply.mock.calls[0][1].embeds[0].data;
    expect(embedData.color).toBe(0xfee75c);
  });

  it('should show error details in embed description', async () => {
    loadConfig.mockRejectedValueOnce(new Error('DB timeout'));
    const interaction = mockInteraction();

    await execute(interaction);

    const embedData = safeEditReply.mock.calls[0][1].embeds[0].data;
    expect(embedData.description).toContain('DB timeout');
  });
});
