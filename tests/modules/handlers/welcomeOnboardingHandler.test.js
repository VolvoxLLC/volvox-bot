import { Events } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetConfig = vi.fn();
const mockHandleRulesAcceptButton = vi.fn();
const mockHandleRoleMenuSelection = vi.fn();
const mockSafeEditReply = vi.fn().mockResolvedValue(undefined);
const mockLogError = vi.fn();

vi.mock('../../../src/modules/config.js', () => ({
  getConfig: (...args) => mockGetConfig(...args),
}));

vi.mock('../../../src/modules/welcomeOnboarding.js', () => ({
  RULES_ACCEPT_BUTTON_ID: 'welcome_rules_accept',
  ROLE_MENU_SELECT_ID: 'welcome_role_select',
  handleRulesAcceptButton: (...args) => mockHandleRulesAcceptButton(...args),
  handleRoleMenuSelection: (...args) => mockHandleRoleMenuSelection(...args),
}));

vi.mock('../../../src/utils/safeSend.js', () => ({
  safeEditReply: (...args) => mockSafeEditReply(...args),
}));

vi.mock('../../../src/logger.js', () => ({
  error: (...args) => mockLogError(...args),
}));

import { registerWelcomeOnboardingHandlers } from '../../../src/modules/handlers/welcomeOnboardingHandler.js';

function createClient() {
  return {
    on: vi.fn(),
  };
}

function getRegisteredHandler(client) {
  expect(client.on).toHaveBeenCalledWith(Events.InteractionCreate, expect.any(Function));
  return client.on.mock.calls[0][1];
}

describe('welcome onboarding interaction handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores interactions without a guild id', async () => {
    const client = createClient();
    registerWelcomeOnboardingHandlers(client);
    const handler = getRegisteredHandler(client);

    await handler({ guildId: null });

    expect(mockGetConfig).not.toHaveBeenCalled();
  });

  it('ignores interactions when welcome is disabled', async () => {
    mockGetConfig.mockReturnValueOnce({ welcome: { enabled: false } });
    const client = createClient();
    registerWelcomeOnboardingHandlers(client);
    const handler = getRegisteredHandler(client);

    await handler({ guildId: 'guild-1' });

    expect(mockHandleRulesAcceptButton).not.toHaveBeenCalled();
    expect(mockHandleRoleMenuSelection).not.toHaveBeenCalled();
  });

  it('handles the rules accept button', async () => {
    const guildConfig = { welcome: { enabled: true } };
    mockGetConfig.mockReturnValueOnce(guildConfig);
    const client = createClient();
    registerWelcomeOnboardingHandlers(client);
    const handler = getRegisteredHandler(client);
    const interaction = {
      guildId: 'guild-1',
      customId: 'welcome_rules_accept',
      isButton: () => true,
      isStringSelectMenu: () => false,
    };

    await handler(interaction);

    expect(mockHandleRulesAcceptButton).toHaveBeenCalledWith(interaction, guildConfig);
  });

  it('sends a fallback reply when the rules accept handler fails', async () => {
    const guildConfig = { welcome: { enabled: true } };
    mockGetConfig.mockReturnValueOnce(guildConfig);
    mockHandleRulesAcceptButton.mockRejectedValueOnce(new Error('nope'));
    const client = createClient();
    registerWelcomeOnboardingHandlers(client);
    const handler = getRegisteredHandler(client);
    const interaction = {
      guildId: 'guild-1',
      customId: 'welcome_rules_accept',
      isButton: () => true,
      isStringSelectMenu: () => false,
      user: { id: 'user-1' },
    };

    await handler(interaction);

    expect(mockLogError).toHaveBeenCalledWith(
      'Rules acceptance handler failed',
      expect.objectContaining({ guildId: 'guild-1', userId: 'user-1', error: 'nope' }),
    );
    expect(mockSafeEditReply).toHaveBeenCalledWith(interaction, {
      content: '❌ Failed to verify. Please ping an admin.',
    });
  });

  it('handles the role menu selection', async () => {
    const guildConfig = { welcome: { enabled: true } };
    mockGetConfig.mockReturnValueOnce(guildConfig);
    const client = createClient();
    registerWelcomeOnboardingHandlers(client);
    const handler = getRegisteredHandler(client);
    const interaction = {
      guildId: 'guild-1',
      customId: 'welcome_role_select',
      isButton: () => false,
      isStringSelectMenu: () => true,
    };

    await handler(interaction);

    expect(mockHandleRoleMenuSelection).toHaveBeenCalledWith(interaction, guildConfig);
  });

  it('sends a fallback reply when the role menu handler fails', async () => {
    const guildConfig = { welcome: { enabled: true } };
    mockGetConfig.mockReturnValueOnce(guildConfig);
    mockHandleRoleMenuSelection.mockRejectedValueOnce(new Error('bad roles'));
    const client = createClient();
    registerWelcomeOnboardingHandlers(client);
    const handler = getRegisteredHandler(client);
    const interaction = {
      guildId: 'guild-1',
      customId: 'welcome_role_select',
      isButton: () => false,
      isStringSelectMenu: () => true,
      user: { id: 'user-1' },
    };

    await handler(interaction);

    expect(mockLogError).toHaveBeenCalledWith(
      'Role menu handler failed',
      expect.objectContaining({ guildId: 'guild-1', userId: 'user-1', error: 'bad roles' }),
    );
    expect(mockSafeEditReply).toHaveBeenCalledWith(interaction, {
      content: '❌ Failed to update roles. Please try again.',
    });
  });
});
