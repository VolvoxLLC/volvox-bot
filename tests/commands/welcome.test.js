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

vi.mock('../../src/utils/discordCache.js', () => ({
  fetchChannelCached: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeSend: vi.fn().mockResolvedValue(undefined),
  safeEditReply: vi.fn().mockResolvedValue(undefined),
}));

import { PermissionsBitField } from 'discord.js';
import { adminOnly, data, execute } from '../../src/commands/welcome.js';
import { getConfig } from '../../src/modules/config.js';
import {
  buildRoleMenuMessage,
  normalizeWelcomeOnboardingConfig,
} from '../../src/modules/welcomeOnboarding.js';
import { fetchChannelCached } from '../../src/utils/discordCache.js';
import { isModerator } from '../../src/utils/permissions.js';
import { safeEditReply, safeSend } from '../../src/utils/safeSend.js';

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

  it('should post both onboarding panels when configured channels are valid', async () => {
    isModerator.mockReturnValueOnce(true);
    getConfig.mockReturnValueOnce({
      welcome: {
        channelId: 'welcome-channel',
      },
    });
    normalizeWelcomeOnboardingConfig.mockReturnValueOnce({
      rulesChannel: 'rules-channel',
    });
    buildRoleMenuMessage.mockReturnValueOnce({ content: 'roles' });

    const rulesChannel = { id: 'rules-channel', isTextBased: vi.fn().mockReturnValue(true) };
    const welcomeChannel = {
      id: 'welcome-channel',
      isTextBased: vi.fn().mockReturnValue(true),
    };
    fetchChannelCached.mockResolvedValueOnce(rulesChannel).mockResolvedValueOnce(welcomeChannel);

    const interaction = mockInteraction({ client: {} });

    await execute(interaction);

    expect(fetchChannelCached).toHaveBeenNthCalledWith(1, interaction.client, 'rules-channel');
    expect(fetchChannelCached).toHaveBeenNthCalledWith(2, interaction.client, 'welcome-channel');
    expect(safeSend).toHaveBeenNthCalledWith(1, rulesChannel, { content: 'rules' });
    expect(safeSend).toHaveBeenNthCalledWith(2, welcomeChannel, { content: 'roles' });

    const reply = safeEditReply.mock.calls.at(-1)?.[1]?.content ?? '';
    expect(reply).toContain('Posted rules agreement panel');
    expect(reply).toContain('Posted role menu');
  });
});
