import { describe, expect, it } from 'vitest';
import { computePatches } from '@/lib/config-utils';

describe('computePatches', () => {
  it('flattens newly added nested objects into dotted leaf patches', () => {
    const original = {
      xp: {
        enabled: false,
        levelThresholds: [100, 300, 600],
      },
    };

    const modified = {
      xp: {
        enabled: false,
        levelThresholds: [100, 300, 600],
        levelUpDm: {
          enabled: true,
          sendOnEveryLevel: false,
          defaultMessage: 'Level {{level}}',
          messages: [],
        },
      },
    };

    expect(computePatches(original, modified)).toEqual([
      { path: 'xp.levelUpDm.enabled', value: true },
      { path: 'xp.levelUpDm.sendOnEveryLevel', value: false },
      { path: 'xp.levelUpDm.defaultMessage', value: 'Level {{level}}' },
      { path: 'xp.levelUpDm.messages', value: [] },
    ]);
  });

  it('preserves empty-object additions and removals', () => {
    expect(computePatches({ xp: {} }, { xp: { levelUpDm: {} } })).toEqual([
      { path: 'xp.levelUpDm', value: {} },
    ]);

    expect(computePatches({ xp: { levelUpDm: {} } }, { xp: {} })).toEqual([
      { path: 'xp.levelUpDm', value: {} },
    ]);
  });

  it('resets removed nested objects at the parent path', () => {
    expect(
      computePatches(
        {
          xp: {
            levelUpDm: {
              enabled: true,
              sendOnEveryLevel: false,
              defaultMessage: 'Level {{level}}',
              messages: [{ level: 5, message: 'Hit {{level}}' }],
            },
          },
        },
        { xp: {} },
      ),
    ).toEqual([
      { path: 'xp.levelUpDm', value: {} },
    ]);
  });

  it('resets explicit empty-object replacements at the parent path', () => {
    expect(
      computePatches(
        {
          xp: {
            levelUpDm: {
              enabled: true,
              sendOnEveryLevel: false,
              defaultMessage: 'Level {{level}}',
              messages: [{ level: 5, message: 'Hit {{level}}' }],
            },
          },
        },
        {
          xp: {
            levelUpDm: {},
          },
        },
      ),
    ).toEqual([{ path: 'xp.levelUpDm', value: {} }]);
  });
});
