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

describe('renderTemplate', () => {
  it('should replace known variables with their values', () => {
    const result = renderTemplate('Hello {{username}}!', { username: 'Alice' });
    expect(result).toBe('Hello Alice!');
  });

  it('should replace multiple variables in the same template', () => {
    const result = renderTemplate('{{mention}} reached Level {{level}}!', {
      mention: '<@123>',
      level: '5',
    });
    expect(result).toBe('<@123> reached Level 5!');
  });

  it('should replace adjacent variables without space', () => {
    const result = renderTemplate('{{username}}{{level}}', {
      username: 'Bob',
      level: '10',
    });
    expect(result).toBe('Bob10');
  });

  it('should replace null/undefined values with empty string', () => {
    const result = renderTemplate('Role: {{roleName}}', { roleName: null });
    expect(result).toBe('Role: ');
  });

  it('should replace undefined context values with empty string', () => {
    const result = renderTemplate('Role: {{roleName}}', { roleName: undefined });
    expect(result).toBe('Role: ');
  });

  it('should leave unknown tokens as-is', () => {
    const result = renderTemplate('Hello {{unknownVar}}!', { username: 'Alice' });
    expect(result).toBe('Hello {{unknownVar}}!');
  });

  it('should return empty string for empty template', () => {
    const result = renderTemplate('', { username: 'Alice' });
    expect(result).toBe('');
  });

  it('should return template as-is when context is empty', () => {
    const result = renderTemplate('No vars here', {});
    expect(result).toBe('No vars here');
  });

  it('should handle template with only a variable', () => {
    const result = renderTemplate('{{username}}', { username: 'Alice' });
    expect(result).toBe('Alice');
  });

  it('should not replace partial matches like {username} or {{username', () => {
    const result = renderTemplate('{username} and {{username', { username: 'Alice' });
    expect(result).toBe('{username} and {{username');
  });
});

describe('validateLength', () => {
  it('should return valid for text under limit', () => {
    const result = validateLength('hello', 2000);
    expect(result).toEqual({ valid: true, length: 5, limit: 2000 });
  });

  it('should return valid for text at exact limit', () => {
    const text = 'a'.repeat(2000);
    const result = validateLength(text, 2000);
    expect(result).toEqual({ valid: true, length: 2000, limit: 2000 });
  });

  it('should return invalid for text over limit', () => {
    const text = 'a'.repeat(2001);
    const result = validateLength(text, 2000);
    expect(result).toEqual({ valid: false, length: 2001, limit: 2000 });
  });

  it('should return valid for empty string', () => {
    const result = validateLength('', 100);
    expect(result).toEqual({ valid: true, length: 0, limit: 100 });
  });
});

describe('buildTemplateContext', () => {
  it('should populate all Discord-derived variables from member/guild/message', async () => {
    const member = {
      user: {
        id: '123456789',
        displayName: 'TestUser',
        displayAvatarURL: () => 'https://cdn.example.com/avatar.png',
      },
      joinedAt: new Date('2025-01-15T12:00:00Z'),
    };
    const message = {
      channel: { name: 'general' },
    };
    const guild = {
      id: 'guild1',
      name: 'Test Server',
      iconURL: () => 'https://cdn.example.com/icon.png',
      memberCount: 1234,
    };

    const ctx = await buildTemplateContext({
      member,
      message,
      guild,
      level: 5,
      previousLevel: 4,
      xp: 1500,
      levelThresholds: [100, 300, 600, 1000, 1500, 2500],
      roleName: null,
      roleId: null,
    });

    expect(ctx.username).toBe('TestUser');
    expect(ctx.mention).toBe('<@123456789>');
    expect(ctx.avatar).toBe('https://cdn.example.com/avatar.png');
    expect(ctx.level).toBe('5');
    expect(ctx.previousLevel).toBe('4');
    expect(ctx.xp).toBe('1,500');
    expect(ctx.xpToNext).toBe('1,000');
    expect(ctx.nextLevel).toBe('6');
    expect(ctx.server).toBe('Test Server');
    expect(ctx.serverIcon).toBe('https://cdn.example.com/icon.png');
    expect(ctx.memberCount).toBe('1,234');
    expect(ctx.channel).toBe('#general');
    expect(ctx.joinDate).toMatch(/Jan/);
    expect(ctx.roleName).toBe('');
    expect(ctx.roleMention).toBe('');
  });

  it('should populate roleName and roleMention when roleId is provided', async () => {
    const member = {
      user: {
        id: '123',
        displayName: 'User',
        displayAvatarURL: () => '',
      },
      joinedAt: new Date(),
    };
    const message = { channel: { name: 'ch' } };
    const guild = {
      id: 'guild1',
      name: 'S',
      iconURL: () => '',
      memberCount: 1,
    };

    const ctx = await buildTemplateContext({
      member,
      message,
      guild,
      level: 1,
      previousLevel: 0,
      xp: 100,
      levelThresholds: [100],
      roleName: 'Regular',
      roleId: '999888777',
    });

    expect(ctx.roleName).toBe('Regular');
    expect(ctx.roleMention).toBe('<@&999888777>');
  });

  it('should return "0" for xpToNext when at max level', async () => {
    const member = {
      user: { id: '1', displayName: 'U', displayAvatarURL: () => '' },
      joinedAt: new Date(),
    };
    const message = { channel: { name: 'ch' } };
    const guild = { id: 'guild1', name: 'S', iconURL: () => '', memberCount: 1 };

    const ctx = await buildTemplateContext({
      member,
      message,
      guild,
      level: 3,
      previousLevel: 2,
      xp: 700,
      levelThresholds: [100, 300, 600],
      roleName: null,
      roleId: null,
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

    const member = {
      user: { id: 'u1', displayName: 'U', displayAvatarURL: () => '' },
      joinedAt: new Date(),
    };
    const guild = { id: 'g1', name: 'S', iconURL: () => '', memberCount: 1 };

    const ctx = await buildTemplateContext({
      member,
      message: { channel: { name: 'ch' } },
      guild,
      level: 1,
      previousLevel: 0,
      xp: 100,
      levelThresholds: [100, 300],
      roleName: null,
      roleId: null,
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

    const member = {
      user: { id: 'u1', displayName: 'U', displayAvatarURL: () => '' },
      joinedAt: new Date(),
    };
    const guild = { id: 'g1', name: 'S', iconURL: () => '', memberCount: 1 };

    const ctx = await buildTemplateContext({
      member,
      message: { channel: { name: 'ch' } },
      guild,
      level: 1,
      previousLevel: 0,
      xp: 100,
      levelThresholds: [100, 300],
      roleName: null,
      roleId: null,
    });

    expect(ctx.rank).toBe('?');
    expect(ctx.messages).toBe('0');
    expect(ctx.daysActive).toBe('0');
    expect(ctx.voiceHours).toBe('0');
  });
});
