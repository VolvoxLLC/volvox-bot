import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/modules/moderation.js', () => ({
  createCase: vi.fn().mockResolvedValue({ case_number: 1, action: 'test', id: 1 }),
  sendDmNotification: vi.fn().mockResolvedValue(undefined),
  sendModLogEmbed: vi.fn().mockResolvedValue({ id: 'msg1' }),
  checkHierarchy: vi.fn().mockReturnValue(null),
  isProtectedTarget: vi.fn().mockReturnValue(false),
  shouldSendDm: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    moderation: {
      dmNotifications: { test: true },
      logging: { channels: { default: '123' } },
    },
  }),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeEditReply: vi.fn().mockImplementation((_inter, msg) => Promise.resolve(msg)),
}));

import { debug, error as logError, warn } from '../../src/logger.js';
import { getConfig } from '../../src/modules/config.js';
import {
  checkHierarchy,
  createCase,
  isProtectedTarget,
  sendDmNotification,
  sendModLogEmbed,
  shouldSendDm,
} from '../../src/modules/moderation.js';
import { executeModAction } from '../../src/utils/modAction.js';
import { safeEditReply } from '../../src/utils/safeSend.js';

describe('executeModAction', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockTarget = {
    id: 'target1',
    user: { id: 'target1', tag: 'Target#0001' },
    roles: { highest: { position: 5 } },
  };

  const createInteraction = () => ({
    guildId: 'guild1',
    options: {
      getString: vi.fn().mockImplementation((name) => {
        if (name === 'reason') return 'test reason';
        return null;
      }),
    },
    guild: {
      id: 'guild1',
      name: 'Test Server',
      members: {
        me: { roles: { highest: { position: 10 } } },
      },
    },
    member: { roles: { highest: { position: 10 } } },
    user: { id: 'mod1', tag: 'Mod#0001' },
    client: { user: { id: 'bot1', tag: 'Bot#0001' } },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
  });

  /**
   * Build a minimal opts object for executeModAction.
   * Override individual fields as needed per test.
   */
  const defaultOpts = (overrides = {}) => ({
    action: 'test',
    getTarget: () => ({
      target: mockTarget,
      targetId: 'target1',
      targetTag: 'Target#0001',
    }),
    actionFn: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  // ---------------------------------------------------------------
  // 1. Happy path
  // ---------------------------------------------------------------
  it('should execute the full pipeline: defer, action, case, mod log, reply', async () => {
    const interaction = createInteraction();
    const actionFn = vi.fn().mockResolvedValue(undefined);

    await executeModAction(interaction, defaultOpts({ actionFn }));

    // deferReply called first
    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });

    // config fetched
    expect(getConfig).toHaveBeenCalledWith('guild1');

    // DM sent
    expect(sendDmNotification).toHaveBeenCalledWith(
      mockTarget,
      'test',
      'test reason',
      'Test Server',
    );

    // action executed
    expect(actionFn).toHaveBeenCalledWith(mockTarget, 'test reason', interaction, {
      reason: 'test reason',
    });

    // case created with correct data
    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        action: 'test',
        targetId: 'target1',
        targetTag: 'Target#0001',
        moderatorId: 'mod1',
        moderatorTag: 'Mod#0001',
        reason: 'test reason',
      }),
    );

    // mod log sent
    expect(sendModLogEmbed).toHaveBeenCalledWith(
      interaction.client,
      expect.any(Object),
      expect.objectContaining({ case_number: 1 }),
    );

    // success reply
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.stringContaining('has been tested'),
    );
  });

  // ---------------------------------------------------------------
  // 2. earlyReturn from getTarget
  // ---------------------------------------------------------------
  describe('earlyReturn from getTarget', () => {
    it('should short-circuit when sync getTarget returns earlyReturn', async () => {
      const interaction = createInteraction();
      const actionFn = vi.fn();

      await executeModAction(
        interaction,
        defaultOpts({
          actionFn,
          getTarget: () => ({ earlyReturn: 'User not found in this server.' }),
        }),
      );

      expect(safeEditReply).toHaveBeenCalledWith(interaction, 'User not found in this server.');
      expect(actionFn).not.toHaveBeenCalled();
      expect(createCase).not.toHaveBeenCalled();
    });

    it('should short-circuit when async getTarget resolves to earlyReturn', async () => {
      const interaction = createInteraction();
      const actionFn = vi.fn();

      // getTarget returns a promise (has .then). The code awaits it.
      await executeModAction(
        interaction,
        defaultOpts({
          actionFn,
          getTarget: () => Promise.resolve({ earlyReturn: 'User not in server.' }),
        }),
      );

      expect(safeEditReply).toHaveBeenCalledWith(interaction, 'User not in server.');
      expect(actionFn).not.toHaveBeenCalled();
      expect(createCase).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // 3. earlyReturn from extractOptions
  // ---------------------------------------------------------------
  it('should short-circuit when extractOptions returns earlyReturn', async () => {
    const interaction = createInteraction();
    const actionFn = vi.fn();
    const getTargetFn = vi.fn();

    await executeModAction(
      interaction,
      defaultOpts({
        actionFn,
        getTarget: getTargetFn,
        extractOptions: () => ({ earlyReturn: 'Invalid duration provided.' }),
      }),
    );

    expect(safeEditReply).toHaveBeenCalledWith(interaction, 'Invalid duration provided.');
    // getTarget should not even be called when extractOptions short-circuits
    expect(getTargetFn).not.toHaveBeenCalled();
    expect(actionFn).not.toHaveBeenCalled();
    expect(createCase).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // 4. Hierarchy check failure
  // ---------------------------------------------------------------
  it('should stop when checkHierarchy returns an error', async () => {
    checkHierarchy.mockReturnValueOnce('You cannot moderate this member.');
    const interaction = createInteraction();
    const actionFn = vi.fn();

    await executeModAction(interaction, defaultOpts({ actionFn }));

    expect(checkHierarchy).toHaveBeenCalledWith(
      interaction.member,
      mockTarget,
      interaction.guild.members.me,
    );
    expect(safeEditReply).toHaveBeenCalledWith(interaction, 'You cannot moderate this member.');
    expect(actionFn).not.toHaveBeenCalled();
    expect(createCase).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // 5. actionFn throws
  // ---------------------------------------------------------------
  it('should catch actionFn errors and send generic error reply', async () => {
    const interaction = createInteraction();
    const actionFn = vi.fn().mockRejectedValue(new Error('Discord API down'));

    await executeModAction(interaction, defaultOpts({ actionFn }));

    expect(logError).toHaveBeenCalledWith(
      'Command error',
      expect.objectContaining({ error: 'Discord API down', command: 'test' }),
    );
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.stringContaining('An error occurred'),
    );
    // Case should NOT be created when actionFn fails
    expect(createCase).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // 6. skipHierarchy: true
  // ---------------------------------------------------------------
  it('should not call checkHierarchy when skipHierarchy is true', async () => {
    const interaction = createInteraction();

    await executeModAction(interaction, defaultOpts({ skipHierarchy: true }));

    expect(checkHierarchy).not.toHaveBeenCalled();
    // Pipeline should continue normally
    expect(createCase).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // Protected-role check
  // ---------------------------------------------------------------
  it('should return early with error when target is protected', async () => {
    const interaction = createInteraction();
    isProtectedTarget.mockReturnValueOnce(true);

    await executeModAction(interaction, defaultOpts());

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.stringContaining('Cannot moderate'),
    );
    expect(createCase).not.toHaveBeenCalled();
  });

  it('should log a warning when protection blocks moderation', async () => {
    const interaction = createInteraction();
    isProtectedTarget.mockReturnValueOnce(true);

    await executeModAction(interaction, defaultOpts());

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('protected role'),
      expect.objectContaining({ targetId: 'target1' }),
    );
  });

  it('should not check protection when skipProtection is true', async () => {
    const interaction = createInteraction();

    await executeModAction(interaction, defaultOpts({ skipProtection: true }));

    expect(isProtectedTarget).not.toHaveBeenCalled();
    expect(createCase).toHaveBeenCalled();
  });

  it('should return early when moderator targets themselves', async () => {
    // Target has same id as the moderator
    const interaction = createInteraction();
    const selfTarget = { ...mockTarget, id: 'mod1' };
    const optsWithSelf = defaultOpts({
      getTarget: () => ({ target: selfTarget, targetId: 'mod1', targetTag: 'Mod#0001' }),
    });

    await executeModAction(interaction, optsWithSelf);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.stringContaining('cannot moderate yourself'),
    );
    expect(createCase).not.toHaveBeenCalled();
  });

  it('should block self-targeting even when skipProtection is true', async () => {
    const interaction = createInteraction();
    const selfTarget = { ...mockTarget, id: 'mod1' };
    const optsWithSelf = defaultOpts({
      skipProtection: true,
      getTarget: () => ({ target: selfTarget, targetId: 'mod1', targetTag: 'Mod#0001' }),
    });

    await executeModAction(interaction, optsWithSelf);

    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.stringContaining('cannot moderate yourself'),
    );
    expect(createCase).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // 7. skipDm: true
  // ---------------------------------------------------------------
  it('should not send DM when skipDm is true', async () => {
    const interaction = createInteraction();

    await executeModAction(interaction, defaultOpts({ skipDm: true }));

    expect(sendDmNotification).not.toHaveBeenCalled();
    expect(shouldSendDm).not.toHaveBeenCalled();
    // Pipeline should continue normally
    expect(createCase).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // 8. afterCase callback
  // ---------------------------------------------------------------
  it('should invoke afterCase with (caseData, interaction, config) after case creation', async () => {
    const interaction = createInteraction();
    const afterCase = vi.fn().mockResolvedValue(undefined);
    const config = getConfig('guild1');

    await executeModAction(interaction, defaultOpts({ afterCase }));

    expect(afterCase).toHaveBeenCalledWith(
      expect.objectContaining({ case_number: 1, action: 'test', id: 1 }),
      interaction,
      config,
    );
    // afterCase should be called after createCase
    expect(createCase).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // 9. Options passthrough to actionFn
  // ---------------------------------------------------------------
  it('should pass resolved options (including _ prefixed fields) to actionFn', async () => {
    const interaction = createInteraction();
    const actionFn = vi.fn().mockResolvedValue(undefined);

    await executeModAction(
      interaction,
      defaultOpts({
        actionFn,
        extractOptions: () => ({
          reason: 'spam',
          _durationMs: 86400000,
          _channel: 'general',
          deleteMessageDays: 7,
        }),
      }),
    );

    // actionFn gets the full options object as 4th param
    expect(actionFn).toHaveBeenCalledWith(mockTarget, 'spam', interaction, {
      reason: 'spam',
      _durationMs: 86400000,
      _channel: 'general',
      deleteMessageDays: 7,
    });
  });

  // ---------------------------------------------------------------
  // Additional: extractOptions extras spread into case data
  // ---------------------------------------------------------------
  it('should spread extra fields from extractOptions into case data', async () => {
    const interaction = createInteraction();

    await executeModAction(
      interaction,
      defaultOpts({
        extractOptions: () => ({
          reason: 'test reason',
          deleteMessageDays: 7,
          duration: '1d',
        }),
      }),
    );

    expect(createCase).toHaveBeenCalledWith(
      'guild1',
      expect.objectContaining({
        reason: 'test reason',
        deleteMessageDays: 7,
        duration: '1d',
      }),
    );
  });

  // ---------------------------------------------------------------
  // Additional: default extractOptions uses interaction.options.getString('reason')
  // ---------------------------------------------------------------
  it('should use interaction.options.getString when no extractOptions provided', async () => {
    const interaction = createInteraction();
    const actionFn = vi.fn().mockResolvedValue(undefined);

    await executeModAction(
      interaction,
      defaultOpts({
        actionFn,
        extractOptions: undefined,
      }),
    );

    expect(interaction.options.getString).toHaveBeenCalledWith('reason');
    expect(actionFn).toHaveBeenCalledWith(mockTarget, 'test reason', interaction, {
      reason: 'test reason',
    });
  });

  // ---------------------------------------------------------------
  // Additional: async getTarget (promise) that succeeds
  // ---------------------------------------------------------------
  it('should await getTarget when it returns a promise', async () => {
    const interaction = createInteraction();
    const actionFn = vi.fn().mockResolvedValue(undefined);

    await executeModAction(
      interaction,
      defaultOpts({
        actionFn,
        getTarget: () =>
          Promise.resolve({
            target: mockTarget,
            targetId: 'target1',
            targetTag: 'Target#0001',
          }),
      }),
    );

    // Pipeline should complete normally
    expect(actionFn).toHaveBeenCalled();
    expect(createCase).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // Additional: no actionFn (e.g. warn command)
  // ---------------------------------------------------------------
  it('should proceed without actionFn when it is omitted', async () => {
    const interaction = createInteraction();

    await executeModAction(interaction, defaultOpts({ actionFn: undefined }));

    // Case should still be created
    expect(createCase).toHaveBeenCalled();
    expect(safeEditReply).toHaveBeenCalledWith(
      interaction,
      expect.stringContaining('has been tested'),
    );
  });

  // ---------------------------------------------------------------
  // Additional: dmAction override
  // ---------------------------------------------------------------
  it('should use dmAction override for DM notification when provided', async () => {
    const interaction = createInteraction();

    await executeModAction(interaction, defaultOpts({ dmAction: 'ban' }));

    expect(shouldSendDm).toHaveBeenCalledWith(expect.any(Object), 'ban');
    expect(sendDmNotification).toHaveBeenCalledWith(
      mockTarget,
      'ban',
      'test reason',
      'Test Server',
    );
  });

  // ---------------------------------------------------------------
  // Additional: formatReply override
  // ---------------------------------------------------------------
  it('should use custom formatReply when provided', async () => {
    const interaction = createInteraction();
    const formatReply = vi.fn().mockReturnValue('Custom: Target#0001 was dealt with.');

    await executeModAction(interaction, defaultOpts({ formatReply }));

    expect(formatReply).toHaveBeenCalledWith(
      'Target#0001',
      expect.objectContaining({ case_number: 1 }),
    );
    expect(safeEditReply).toHaveBeenCalledWith(interaction, 'Custom: Target#0001 was dealt with.');
  });

  // ---------------------------------------------------------------
  // Additional: hierarchy check skipped when target is null
  // ---------------------------------------------------------------
  it('should skip hierarchy check when target is null (even with skipHierarchy false)', async () => {
    const interaction = createInteraction();

    await executeModAction(
      interaction,
      defaultOpts({
        getTarget: () => ({
          target: null,
          targetId: 'target1',
          targetTag: 'Target#0001',
        }),
      }),
    );

    expect(checkHierarchy).not.toHaveBeenCalled();
    // Pipeline continues
    expect(createCase).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // Additional: DM skipped when target is null
  // ---------------------------------------------------------------
  it('should skip DM when target is null', async () => {
    const interaction = createInteraction();

    await executeModAction(
      interaction,
      defaultOpts({
        getTarget: () => ({
          target: null,
          targetId: 'target1',
          targetTag: 'Target#0001',
        }),
      }),
    );

    expect(sendDmNotification).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // Additional: shouldSendDm returns false
  // ---------------------------------------------------------------
  it('should not send DM when shouldSendDm returns false', async () => {
    shouldSendDm.mockReturnValueOnce(false);
    const interaction = createInteraction();

    await executeModAction(interaction, defaultOpts());

    expect(shouldSendDm).toHaveBeenCalledWith(expect.any(Object), 'test');
    expect(sendDmNotification).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------
  // Additional: error reply itself fails (double fault)
  // ---------------------------------------------------------------
  it('should silently catch when error reply also fails', async () => {
    const interaction = createInteraction();
    const actionFn = vi.fn().mockRejectedValue(new Error('Action failed'));
    safeEditReply.mockRejectedValueOnce(new Error('Reply also failed'));

    // Should not throw
    await executeModAction(interaction, defaultOpts({ actionFn }));

    expect(debug).toHaveBeenCalledWith(
      'Failed to send error reply',
      expect.objectContaining({ error: 'Reply also failed', command: 'test' }),
    );
  });
});
