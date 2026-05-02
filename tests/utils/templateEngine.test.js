import { vi } from 'vitest';

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  })),
}));

import { describe, expect, it } from 'vitest';

import {
  buildTemplateContext,
  renderTemplate,
  validateLength,
} from '../../src/utils/templateEngine.js';

function makeMember({ id = '1', displayName = 'U', avatar = '', joinedAt = new Date() } = {}) {
  return {
    user: { id, displayName, displayAvatarURL: () => avatar },
    joinedAt,
  };
}

function makeGuild({ id = 'guild1', name = 'S', icon = '', memberCount = 1 } = {}) {
  return { id, name, iconURL: () => icon, memberCount };
}

function makeMessage(channelName = 'ch') {
  return { channel: { name: channelName } };
}

async function buildLevelContext(overrides = {}) {
  return buildTemplateContext({
    member: makeMember(),
    message: makeMessage(),
    guild: makeGuild(),
    level: 1,
    previousLevel: 0,
    xp: 100,
    levelThresholds: [100, 300],
    roleName: null,
    roleId: null,
    ...overrides,
  });
}

describe('renderTemplate', () => {
  it.each([
    ['known variables', 'Hello {{username}}!', { username: 'Alice' }, 'Hello Alice!'],
    [
      'multiple variables in the same template',
      '{{mention}} reached Level {{level}}!',
      { mention: '<@123>', level: '5' },
      '<@123> reached Level 5!',
    ],
    [
      'adjacent variables without space',
      '{{username}}{{level}}',
      { username: 'Bob', level: '10' },
      'Bob10',
    ],
    ['null context values', 'Role: {{roleName}}', { roleName: null }, 'Role: '],
    ['undefined context values', 'Role: {{roleName}}', { roleName: undefined }, 'Role: '],
    ['unknown tokens', 'Hello {{unknownVar}}!', { username: 'Alice' }, 'Hello {{unknownVar}}!'],
    ['empty template', '', { username: 'Alice' }, ''],
    ['empty context', 'No vars here', {}, 'No vars here'],
    ['template with only a variable', '{{username}}', { username: 'Alice' }, 'Alice'],
    [
      'partial matches like {username} or {{username',
      '{username} and {{username',
      { username: 'Alice' },
      '{username} and {{username',
    ],
  ])('should render %s', (_caseName, template, context, expected) => {
    expect(renderTemplate(template, context)).toBe(expected);
  });
});

describe('validateLength', () => {
  it.each([
    ['text under limit', 'hello', 2000, { valid: true, length: 5, limit: 2000 }],
    ['text at exact limit', 'a'.repeat(2000), 2000, { valid: true, length: 2000, limit: 2000 }],
    ['text over limit', 'a'.repeat(2001), 2000, { valid: false, length: 2001, limit: 2000 }],
    ['empty string', '', 100, { valid: true, length: 0, limit: 100 }],
  ])('should return the expected result for %s', (_caseName, text, limit, expected) => {
    expect(validateLength(text, limit)).toEqual(expected);
  });
});

describe('buildTemplateContext', () => {
  it('should populate all Discord-derived variables from member/guild/message', async () => {
    const ctx = await buildLevelContext({
      member: makeMember({
        id: '123456789',
        displayName: 'TestUser',
        avatar: 'https://cdn.example.com/avatar.png',
        joinedAt: new Date('2025-01-15T12:00:00Z'),
      }),
      message: makeMessage('general'),
      guild: makeGuild({
        id: 'guild1',
        name: 'Test Server',
        icon: 'https://cdn.example.com/icon.png',
        memberCount: 1234,
      }),
      level: 5,
      previousLevel: 4,
      xp: 1500,
      levelThresholds: [100, 300, 600, 1000, 1500, 2500],
    });

    expect(ctx.username).toBe('TestUser');
    expect(ctx.mention).toBe('<@123456789>');
    expect(ctx.userId).toBe('123456789');
    expect(ctx.avatar).toBe('https://cdn.example.com/avatar.png');
    expect(ctx.level).toBe('5');
    expect(ctx.previousLevel).toBe('4');
    expect(ctx.xp).toBe('1,500');
    expect(ctx.xpToNext).toBe('1,000');
    expect(ctx.nextLevel).toBe('6');
    expect(ctx.serverName).toBe('Test Server');
    expect(ctx.serverId).toBe('guild1');
    expect(ctx.server).toBe('Test Server');
    expect(ctx.serverIcon).toBe('https://cdn.example.com/icon.png');
    expect(ctx.memberCount).toBe('1,234');
    expect(ctx.channel).toBe('#general');
    expect(ctx.joinDate).toMatch(/Jan/);
    expect(ctx.roleName).toBe('');
    expect(ctx.roleMention).toBe('');
  });

  it('should populate roleName and roleMention when roleId is provided', async () => {
    const ctx = await buildLevelContext({
      member: makeMember({ id: '123', displayName: 'User' }),
      levelThresholds: [100],
      roleName: 'Regular',
      roleId: '999888777',
    });

    expect(ctx.roleName).toBe('Regular');
    expect(ctx.roleMention).toBe('<@&999888777>');
  });

  it('should return "0" for xpToNext when at max level', async () => {
    const ctx = await buildLevelContext({
      level: 3,
      previousLevel: 2,
      xp: 700,
      levelThresholds: [100, 300, 600],
    });

    expect(ctx.xpToNext).toBe('0');
    expect(ctx.nextLevel).toBe('0');
  });

  it('should populate DB-derived variables when query returns rows', async () => {
    const { getPool } = await import('../../src/db.js');
    getPool.mockReturnValueOnce({
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ rank: 3 }] })
        .mockResolvedValueOnce({
          rows: [{ messages_count: 42, days_active: 7, voice_seconds: 3600 }],
        }),
    });

    const ctx = await buildLevelContext({
      member: makeMember({ id: 'u1' }),
      guild: makeGuild({ id: 'g1' }),
    });

    expect(ctx.rank).toBe('#3');
    expect(ctx.messages).toBe('42');
    expect(ctx.daysActive).toBe('7');
    expect(ctx.voiceHours).toBe('1');
  });

  it('should use fallback values when DB query rejects', async () => {
    const { getPool } = await import('../../src/db.js');
    getPool.mockReturnValueOnce({
      query: vi.fn().mockRejectedValue(new Error('DB down')),
    });

    const ctx = await buildLevelContext({
      member: makeMember({ id: 'u1' }),
      guild: makeGuild({ id: 'g1' }),
    });

    expect(ctx.rank).toBe('?');
    expect(ctx.messages).toBe('0');
    expect(ctx.daysActive).toBe('0');
    expect(ctx.voiceHours).toBe('0');
  });

  it('should correctly compute xpToNext when the threshold for the current level is 0', async () => {
    // Object.hasOwn(levelThresholds, 0) is true, so hasNextLevel=true and nextThreshold=0
    // xpToNext = 0 - xp = negative → Math.max(0, xpToNext) → "0"
    const ctx = await buildLevelContext({
      level: 0,
      previousLevel: 0,
      xp: 50,
      levelThresholds: [0, 100, 300],
    });

    // Level 0 threshold is 0; xpToNext = 0 - 50 = -50, clamped to 0
    expect(ctx.xpToNext).toBe('0');
    // nextLevel should be level + 1 = 1 (not '0' since hasNextLevel is true)
    expect(ctx.nextLevel).toBe('1');
  });

  it('should return nextLevel "0" and xpToNext "0" when level is beyond the last threshold index', async () => {
    // Level 5 with only 3 thresholds → Object.hasOwn([...], 5) = false → hasNextLevel=false
    const ctx = await buildLevelContext({
      level: 5,
      previousLevel: 4,
      xp: 9999,
      levelThresholds: [100, 300, 600],
    });

    expect(ctx.xpToNext).toBe('0');
    expect(ctx.nextLevel).toBe('0');
  });

  it('should treat a missing threshold key as no next level', async () => {
    // Plain object thresholds with no key for the current level should not count as a next level.
    // Plain object thresholds — key 1 does not exist, so Object.hasOwn(thresholds, 1) = false
    const thresholdsWithGap = { 0: 100, 2: 600 }; // key 1 is absent

    const ctx = await buildLevelContext({
      xp: 200,
      levelThresholds: thresholdsWithGap,
    });

    // key 1 absent → hasNextLevel=false → xpToNext=0, nextLevel='0'
    expect(ctx.xpToNext).toBe('0');
    expect(ctx.nextLevel).toBe('0');
  });
});
