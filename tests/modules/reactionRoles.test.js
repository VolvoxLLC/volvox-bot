/**
 * Tests for src/modules/reactionRoles.js
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

import { getPool } from '../../src/db.js';
import {
  buildReactionRoleEmbed,
  deleteMenu,
  findMenuByMessageId,
  findRoleForReaction,
  getEntriesForMenu,
  handleReactionRoleAdd,
  handleReactionRoleRemove,
  insertReactionRoleMenu,
  listMenusForGuild,
  removeReactionRoleEntry,
  resolveEmojiString,
  upsertReactionRoleEntry,
} from '../../src/modules/reactionRoles.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockPool(queryResult = { rows: [], rowCount: 0 }) {
  const pool = { query: vi.fn().mockResolvedValue(queryResult) };
  getPool.mockReturnValue(pool);
  return pool;
}

function makeEmoji(overrides = {}) {
  return { id: null, name: '👍', animated: false, ...overrides };
}

function makeReaction({ messageId = 'msg-1', guildId = 'guild-1', emoji = makeEmoji() } = {}) {
  const guild = {
    id: guildId,
    members: { fetch: vi.fn() },
    roles: { cache: new Map(), fetch: vi.fn() },
  };
  return {
    emoji,
    message: {
      id: messageId,
      guild,
      partial: false,
      fetch: vi.fn(),
    },
  };
}

function makeUser(id = 'user-1', bot = false) {
  return { id, bot };
}

// ── resolveEmojiString ────────────────────────────────────────────────────────

describe('resolveEmojiString', () => {
  it('returns emoji name for unicode emoji', () => {
    expect(resolveEmojiString({ id: null, name: '⭐', animated: false })).toBe('⭐');
  });

  it('returns <:name:id> for custom emoji', () => {
    expect(resolveEmojiString({ id: '123456', name: 'cool', animated: false })).toBe(
      '<:cool:123456>',
    );
  });

  it('returns <a:name:id> for animated custom emoji', () => {
    expect(resolveEmojiString({ id: '789', name: 'wave', animated: true })).toBe('<a:wave:789>');
  });
});

// ── buildReactionRoleEmbed ────────────────────────────────────────────────────

describe('buildReactionRoleEmbed', () => {
  it('returns an EmbedBuilder with title and footer', () => {
    const embed = buildReactionRoleEmbed('Pick a Role', null, []);
    const data = embed.toJSON();
    expect(data.title).toBe('Pick a Role');
    expect(data.footer?.text).toMatch(/React to this message/);
  });

  it('includes placeholder text when no entries provided', () => {
    const embed = buildReactionRoleEmbed('Roles', null, []);
    const data = embed.toJSON();
    expect(data.description).toContain('No roles configured');
  });

  it('lists entries in description', () => {
    const entries = [
      { emoji: '⭐', role_id: 'role-1' },
      { emoji: '<:cool:123>', role_id: 'role-2' },
    ];
    const embed = buildReactionRoleEmbed('Roles', 'Pick one', entries);
    const data = embed.toJSON();
    expect(data.description).toContain('⭐');
    expect(data.description).toContain('role-1');
    expect(data.description).toContain('<:cool:123>');
    expect(data.description).toContain('Pick one');
  });
});

// ── DB helpers ────────────────────────────────────────────────────────────────

describe('insertReactionRoleMenu', () => {
  it('calls INSERT ... ON CONFLICT and returns the row', async () => {
    const row = {
      id: 1,
      guild_id: 'g-1',
      channel_id: 'ch-1',
      message_id: 'msg-1',
      title: 'T',
      description: null,
    };
    const pool = mockPool({ rows: [row] });
    const result = await insertReactionRoleMenu('g-1', 'ch-1', 'msg-1', 'T', null);
    expect(pool.query).toHaveBeenCalledOnce();
    expect(result).toEqual(row);
  });
});

describe('findMenuByMessageId', () => {
  it('returns the row when found', async () => {
    const row = { id: 1, message_id: 'msg-1' };
    mockPool({ rows: [row] });
    expect(await findMenuByMessageId('msg-1')).toEqual(row);
  });

  it('returns null when not found', async () => {
    mockPool({ rows: [] });
    expect(await findMenuByMessageId('ghost')).toBeNull();
  });
});

describe('listMenusForGuild', () => {
  it('returns all rows', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    mockPool({ rows });
    expect(await listMenusForGuild('g-1')).toEqual(rows);
  });

  it('returns empty array when none', async () => {
    mockPool({ rows: [] });
    expect(await listMenusForGuild('g-1')).toEqual([]);
  });
});

describe('deleteMenu', () => {
  it('returns true when row deleted', async () => {
    mockPool({ rows: [], rowCount: 1 });
    expect(await deleteMenu(1)).toBe(true);
  });

  it('returns false when nothing deleted', async () => {
    mockPool({ rows: [], rowCount: 0 });
    expect(await deleteMenu(99)).toBe(false);
  });
});

describe('upsertReactionRoleEntry', () => {
  it('returns the inserted row', async () => {
    const row = { id: 1, menu_id: 1, emoji: '⭐', role_id: 'r-1' };
    const pool = mockPool({ rows: [row] });
    const result = await upsertReactionRoleEntry(1, '⭐', 'r-1');
    expect(pool.query).toHaveBeenCalledOnce();
    expect(result).toEqual(row);
  });
});

describe('removeReactionRoleEntry', () => {
  it('returns true when deleted', async () => {
    mockPool({ rows: [], rowCount: 1 });
    expect(await removeReactionRoleEntry(1, '⭐')).toBe(true);
  });

  it('returns false when not found', async () => {
    mockPool({ rows: [], rowCount: 0 });
    expect(await removeReactionRoleEntry(1, '❓')).toBe(false);
  });
});

describe('getEntriesForMenu', () => {
  it('returns all entries', async () => {
    const rows = [{ id: 1, emoji: '⭐', role_id: 'r-1' }];
    mockPool({ rows });
    expect(await getEntriesForMenu(1)).toEqual(rows);
  });
});

describe('findRoleForReaction', () => {
  it('returns roleId when mapping exists', async () => {
    mockPool({ rows: [{ role_id: 'r-42' }] });
    expect(await findRoleForReaction('msg-1', '⭐')).toBe('r-42');
  });

  it('returns null when no mapping', async () => {
    mockPool({ rows: [] });
    expect(await findRoleForReaction('msg-1', '🦄')).toBeNull();
  });
});

// ── handleReactionRoleAdd ─────────────────────────────────────────────────────

describe('handleReactionRoleAdd', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when pool is unavailable', async () => {
    getPool.mockReturnValue(null);
    const reaction = makeReaction();
    // Should not throw
    await expect(handleReactionRoleAdd(reaction, makeUser())).resolves.toBeUndefined();
  });

  it('does nothing when no role mapping found', async () => {
    // findRoleForReaction → null
    mockPool({ rows: [] });
    const reaction = makeReaction();
    await handleReactionRoleAdd(reaction, makeUser());
    // No member.roles.add should have been called
  });

  it('grants the role when mapping exists and member lacks it', async () => {
    const pool = { query: vi.fn() };
    // findRoleForReaction returns 'role-99'
    pool.query.mockResolvedValueOnce({ rows: [{ role_id: 'role-99' }] });
    getPool.mockReturnValue(pool);

    const role = { id: 'role-99', position: 1 };
    const member = {
      roles: {
        cache: new Map(),
        add: vi.fn().mockResolvedValue(undefined),
      },
    };
    const guild = {
      id: 'guild-1',
      members: { fetch: vi.fn().mockResolvedValue(member) },
      roles: { cache: new Map([['role-99', role]]), fetch: vi.fn() },
    };
    const reaction = {
      emoji: { id: null, name: '⭐', animated: false },
      message: { id: 'msg-1', guild, partial: false, fetch: vi.fn() },
    };

    await handleReactionRoleAdd(reaction, makeUser());
    expect(member.roles.add).toHaveBeenCalledWith(role, 'Reaction role assignment');
  });

  it('skips granting if member already has the role', async () => {
    const pool = { query: vi.fn() };
    pool.query.mockResolvedValueOnce({ rows: [{ role_id: 'role-99' }] });
    getPool.mockReturnValue(pool);

    const role = { id: 'role-99', position: 1 };
    const member = {
      roles: {
        cache: new Map([['role-99', role]]),
        add: vi.fn(),
      },
    };
    const guild = {
      id: 'guild-1',
      members: { fetch: vi.fn().mockResolvedValue(member) },
      roles: { cache: new Map([['role-99', role]]), fetch: vi.fn() },
    };
    const reaction = {
      emoji: { id: null, name: '⭐', animated: false },
      message: { id: 'msg-1', guild, partial: false, fetch: vi.fn() },
    };

    await handleReactionRoleAdd(reaction, makeUser());
    expect(member.roles.add).not.toHaveBeenCalled();
  });
});

// ── handleReactionRoleRemove ──────────────────────────────────────────────────

describe('handleReactionRoleRemove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when pool is unavailable', async () => {
    getPool.mockReturnValue(null);
    const reaction = makeReaction();
    await expect(handleReactionRoleRemove(reaction, makeUser())).resolves.toBeUndefined();
  });

  it('does nothing when no role mapping found', async () => {
    mockPool({ rows: [] });
    const reaction = makeReaction();
    await handleReactionRoleRemove(reaction, makeUser());
    // No removal should be attempted
  });

  it('removes the role when member has it', async () => {
    const pool = { query: vi.fn() };
    pool.query.mockResolvedValueOnce({ rows: [{ role_id: 'role-77' }] });
    getPool.mockReturnValue(pool);

    const member = {
      roles: {
        cache: new Map([['role-77', {}]]),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    };
    const guild = {
      id: 'guild-1',
      members: { fetch: vi.fn().mockResolvedValue(member) },
    };
    const reaction = {
      emoji: { id: null, name: '⭐', animated: false },
      message: { id: 'msg-1', guild, partial: false, fetch: vi.fn() },
    };

    await handleReactionRoleRemove(reaction, makeUser());
    expect(member.roles.remove).toHaveBeenCalledWith('role-77', 'Reaction role removal');
  });

  it('skips removal if member does not have the role', async () => {
    const pool = { query: vi.fn() };
    pool.query.mockResolvedValueOnce({ rows: [{ role_id: 'role-77' }] });
    getPool.mockReturnValue(pool);

    const member = {
      roles: {
        cache: new Map(), // member doesn't have role-77
        remove: vi.fn(),
      },
    };
    const guild = {
      id: 'guild-1',
      members: { fetch: vi.fn().mockResolvedValue(member) },
    };
    const reaction = {
      emoji: { id: null, name: '⭐', animated: false },
      message: { id: 'msg-1', guild, partial: false, fetch: vi.fn() },
    };

    await handleReactionRoleRemove(reaction, makeUser());
    expect(member.roles.remove).not.toHaveBeenCalled();
  });
});
