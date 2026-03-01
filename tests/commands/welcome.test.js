import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/modules/welcomeOnboarding.js', () => ({
  buildRoleMenuMessage: vi.fn().mockReturnValue(null),
  buildRulesAgreementMessage: vi.fn().mockReturnValue({ content: 'rules' }),
  normalizeWelcomeOnboardingConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/utils/permissions.js', () => ({
  isModerator: vi.fn().mockReturnValue(false),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue(undefined),
  safeEditReply: vi.fn().mockResolvedValue(undefined),
}));

import { PermissionsBitField } from 'discord.js';
import { adminOnly, data, execute } from '../../src/commands/welcome.js';
import { isModerator } from '../../src/utils/permissions.js';
import { safeEditReply } from '../../src/utils/safeSend.js';

function mockInteraction(overrides = {}) {
  return {
    member: {
      id: 'user-1',
      permissions: new PermissionsBitField(),
    },
    user: { id: 'user-1' },
    guildId: 'guild-1',
    guild: {
      channels: {
        cache: { get: vi.fn().mockReturnValue(null) },
        fetch: vi.fn().mockResolvedValue(null),
      },
    },
    deferReply: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('welcome command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with name "welcome"', () => {
    expect(data.name).toBe('welcome');
  });

  it('should export adminOnly = true', () => {
    expect(adminOnly).toBe(true);
  });

  it('should reject non-admin non-moderator users', async () => {
    const interaction = mockInteraction();

    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        content: expect.stringContaining('moderator or administrator'),
      }),
    );
  });

  it('should show not configured messages when welcome config is empty', async () => {
    isModerator.mockReturnValueOnce(true);
    const interaction = mockInteraction();

    await execute(interaction);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.objectContaining({
        content: expect.stringContaining('not configured'),
      }),
    );
  });
});
