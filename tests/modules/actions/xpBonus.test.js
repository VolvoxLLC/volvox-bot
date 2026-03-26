import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockQuery = vi.fn().mockResolvedValue({ rows: [] });
vi.mock('../../../src/db.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import { handleXpBonus, isXpBonusActive } from '../../../src/modules/actions/xpBonus.js';
import { warn } from '../../../src/logger.js';

function makeContext() {
  return {
    member: { user: { id: 'user1' } },
    guild: { id: 'guild1' },
  };
}

describe('handleXpBonus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it('should grant bonus XP to the user', async () => {
    const ctx = makeContext();
    await handleXpBonus({ type: 'xpBonus', amount: 100 }, ctx);

    expect(mockQuery).toHaveBeenCalledWith(
      'UPDATE reputation SET xp = xp + $1 WHERE guild_id = $2 AND user_id = $3',
      [100, 'guild1', 'user1'],
    );
  });

  it('should skip if amount is zero', async () => {
    const ctx = makeContext();
    await handleXpBonus({ type: 'xpBonus', amount: 0 }, ctx);

    expect(mockQuery).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'xpBonus action has invalid amount — skipping',
      expect.any(Object),
    );
  });

  it('should skip if amount is negative', async () => {
    const ctx = makeContext();
    await handleXpBonus({ type: 'xpBonus', amount: -50 }, ctx);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should skip if amount is not a number', async () => {
    const ctx = makeContext();
    await handleXpBonus({ type: 'xpBonus', amount: 'abc' }, ctx);

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('should detect recursion and skip', async () => {
    // Simulate recursion by making the DB query call handleXpBonus again
    const ctx = makeContext();
    let recursiveCallSkipped = false;

    mockQuery.mockImplementation(async () => {
      // During the DB write, try to grant xpBonus again for the same user
      expect(isXpBonusActive('guild1', 'user1')).toBe(true);
      const innerCtx = makeContext();
      await handleXpBonus({ type: 'xpBonus', amount: 50 }, innerCtx);
      recursiveCallSkipped = true;
      return { rows: [] };
    });

    await handleXpBonus({ type: 'xpBonus', amount: 100 }, ctx);

    expect(recursiveCallSkipped).toBe(true);
    // The recursive call should have been warned about
    expect(warn).toHaveBeenCalledWith(
      'xpBonus recursion detected — skipping to prevent infinite loop',
      expect.objectContaining({ guildId: 'guild1', userId: 'user1' }),
    );
    // Only one DB query (the first call), the recursive call is skipped
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('should clear recursion guard after completion', async () => {
    const ctx = makeContext();
    await handleXpBonus({ type: 'xpBonus', amount: 100 }, ctx);

    expect(isXpBonusActive('guild1', 'user1')).toBe(false);
  });

  it('should clear recursion guard even on DB error', async () => {
    const ctx = makeContext();
    mockQuery.mockRejectedValue(new Error('DB down'));

    await expect(handleXpBonus({ type: 'xpBonus', amount: 100 }, ctx)).rejects.toThrow('DB down');
    expect(isXpBonusActive('guild1', 'user1')).toBe(false);
  });
});
