import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../src/utils/templateEngine.js', () => ({
  buildTemplateContext: vi.fn().mockResolvedValue({
    username: 'TestUser',
    mention: '<@123>',
    level: '5',
  }),
}));

vi.mock('../../src/modules/actions/roleUtils.js', () => ({
  collectXpManagedRoles: vi.fn(() => new Set()),
}));

vi.mock('../../src/modules/actions/grantRole.js', () => ({
  handleGrantRole: vi.fn(),
}));

vi.mock('../../src/modules/actions/removeRole.js', () => ({
  handleRemoveRole: vi.fn(),
}));

import { warn } from '../../src/logger.js';
import {
  executeLevelUpPipeline,
  registerAction,
  resolveActions,
} from '../../src/modules/levelUpActions.js';

describe('resolveActions', () => {
  it('should return level-specific actions for an exact match', () => {
    const config = {
      levelActions: [
        { level: 5, actions: [{ type: 'grantRole', roleId: 'r1' }] },
      ],
      defaultActions: [{ type: 'addReaction', emoji: '⬆️' }],
    };

    const result = resolveActions(4, 5, config);
    expect(result).toEqual([
      { level: 5, action: { type: 'grantRole', roleId: 'r1' } },
    ]);
  });

  it('should return default actions when no level-specific entry exists', () => {
    const config = {
      levelActions: [],
      defaultActions: [{ type: 'addReaction', emoji: '⬆️' }],
    };

    const result = resolveActions(2, 3, config);
    expect(result).toEqual([
      { level: 3, action: { type: 'addReaction', emoji: '⬆️' } },
    ]);
  });

  it('should handle level skip: 4→12 fires actions for 5, 10, 12', () => {
    const config = {
      levelActions: [
        { level: 5, actions: [{ type: 'grantRole', roleId: 'r1' }] },
        { level: 10, actions: [{ type: 'grantRole', roleId: 'r2' }] },
      ],
      defaultActions: [{ type: 'addReaction', emoji: '⬆️' }],
    };

    const result = resolveActions(4, 12, config);

    // Level 5: specific actions
    expect(result[0]).toEqual({ level: 5, action: { type: 'grantRole', roleId: 'r1' } });
    // Level 6-9: default actions each
    expect(result.filter((r) => r.level >= 6 && r.level <= 9)).toHaveLength(4);
    expect(result.filter((r) => r.level >= 6 && r.level <= 9).every(
      (r) => r.action.type === 'addReaction'
    )).toBe(true);
    // Level 10: specific actions
    expect(result.find((r) => r.level === 10)).toEqual({
      level: 10,
      action: { type: 'grantRole', roleId: 'r2' },
    });
    // Level 11: default
    expect(result.find((r) => r.level === 11)?.action.type).toBe('addReaction');
    // Level 12: default (no specific entry)
    expect(result.find((r) => r.level === 12)?.action.type).toBe('addReaction');
  });

  it('should return empty array when no actions and no defaults', () => {
    const config = { levelActions: [], defaultActions: [] };
    const result = resolveActions(0, 1, config);
    expect(result).toEqual([]);
  });

  it('should return empty array when previousLevel equals newLevel', () => {
    const config = {
      levelActions: [{ level: 1, actions: [{ type: 'grantRole', roleId: 'r' }] }],
      defaultActions: [],
    };
    const result = resolveActions(1, 1, config);
    expect(result).toEqual([]);
  });
});

describe('executeLevelUpPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute registered actions sequentially', async () => {
    const calls = [];
    registerAction('testAction', async (action, ctx) => {
      calls.push({ type: action.type, data: action.data });
    });

    await executeLevelUpPipeline({
      member: { user: { id: '123' }, roles: { cache: new Map() } },
      message: { channel: { name: 'general' } },
      guild: { id: 'g1', name: 'S', iconURL: () => '', memberCount: 1 },
      previousLevel: 0,
      newLevel: 1,
      xp: 100,
      config: {
        levelActions: [
          { level: 1, actions: [
            { type: 'testAction', data: 'first' },
            { type: 'testAction', data: 'second' },
          ]},
        ],
        defaultActions: [],
        roleRewards: { stackRoles: true },
        levelThresholds: [100],
      },
    });

    expect(calls).toEqual([
      { type: 'testAction', data: 'first' },
      { type: 'testAction', data: 'second' },
    ]);
  });

  it('should continue executing actions when one fails', async () => {
    const calls = [];
    registerAction('failAction', async () => {
      throw new Error('boom');
    });
    registerAction('successAction', async (action) => {
      calls.push('success');
    });

    await executeLevelUpPipeline({
      member: { user: { id: '123' }, roles: { cache: new Map() } },
      message: { channel: { name: 'general' } },
      guild: { id: 'g1', name: 'S', iconURL: () => '', memberCount: 1 },
      previousLevel: 0,
      newLevel: 1,
      xp: 100,
      config: {
        levelActions: [
          { level: 1, actions: [
            { type: 'failAction' },
            { type: 'successAction' },
          ]},
        ],
        defaultActions: [],
        roleRewards: { stackRoles: true },
        levelThresholds: [100],
      },
    });

    expect(calls).toEqual(['success']);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Action failed'),
      expect.objectContaining({ actionType: 'failAction' }),
    );
  });

  it('should skip unknown action types with a warning', async () => {
    await executeLevelUpPipeline({
      member: { user: { id: '123' }, roles: { cache: new Map() } },
      message: { channel: { name: 'general' } },
      guild: { id: 'g1', name: 'S', iconURL: () => '', memberCount: 1 },
      previousLevel: 0,
      newLevel: 1,
      xp: 100,
      config: {
        levelActions: [
          { level: 1, actions: [{ type: 'nonexistentAction' }] },
        ],
        defaultActions: [],
        roleRewards: { stackRoles: true },
        levelThresholds: [100],
      },
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unknown action type'),
      expect.objectContaining({ actionType: 'nonexistentAction' }),
    );
  });

  it('should be a no-op when no actions resolve', async () => {
    await expect(
      executeLevelUpPipeline({
        member: { user: { id: '123' }, roles: { cache: new Map() } },
        message: { channel: { name: 'general' } },
        guild: { id: 'g1', name: 'S', iconURL: () => '', memberCount: 1 },
        previousLevel: 0,
        newLevel: 1,
        xp: 100,
        config: {
          levelActions: [],
          defaultActions: [],
          roleRewards: { stackRoles: true },
          levelThresholds: [100],
        },
      }),
    ).resolves.not.toThrow();
  });
});
