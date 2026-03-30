# Level-Up Action Pipeline — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline level-up side-effects in `reputation.js` with a configurable action pipeline under `config.xp`, delivering the pipeline executor, role grant/remove actions, and template interpolation engine.

**Architecture:** New `config.xp` section owns leveling config (thresholds, actions, role stacking). `reputation.js` keeps XP gain mechanics but delegates level-up effects to `executeLevelUpPipeline()` in a new `levelUpActions.js` module. Actions are registered in a type→handler map, making Phase 2 action types a one-line registration each. Template engine is a standalone pure utility in `src/utils/templateEngine.js`.

**Tech Stack:** Node 22+, ESM, discord.js, PostgreSQL, Vitest

**Spec:** `docs/superpowers/specs/2026-03-25-level-up-actions-phase1-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/modules/xpDefaults.js` | Default `config.xp` values (single source of truth) |
| `src/utils/templateEngine.js` | `renderTemplate()`, `buildTemplateContext()`, `validateLength()` |
| `src/modules/levelUpActions.js` | Pipeline executor, action registry, XP-managed role set computation |
| `src/modules/actions/roleUtils.js` | Permission checks, rate limiter, stack/replace logic, `enforceRoleLevelDown()` |
| `src/modules/actions/grantRole.js` | `grantRole` action handler |
| `src/modules/actions/removeRole.js` | `removeRole` action handler |
| `tests/utils/templateEngine.test.js` | Template engine tests |
| `tests/modules/levelUpActions.test.js` | Pipeline engine tests |
| `tests/modules/actions/roleUtils.test.js` | Role utility tests |
| `tests/modules/actions/grantRole.test.js` | Grant role action tests |
| `tests/modules/actions/removeRole.test.js` | Remove role action tests |

**Modified files:**
| File | Change |
|------|--------|
| `config.json` | Add `xp` section; trim `reputation` section |
| `src/modules/reputationDefaults.js` | Remove `roleRewards`, `announceChannelId`, `levelThresholds` |
| `src/api/utils/configAllowlist.js` | Add `'xp'` to `SAFE_CONFIG_KEYS` |
| `src/modules/reputation.js` | Remove inline level-up effects, call pipeline |
| `src/commands/rank.js` | Read `levelThresholds` from `config.xp` via `xpDefaults` |
| `src/commands/leaderboard.js` | No changes needed (doesn't use `levelThresholds`) |
| `src/api/routes/community.js` | Read `levelThresholds` from XP config |
| `src/api/routes/members.js` | Read `levelThresholds` from XP config; call `enforceRoleLevelDown` on XP reduction |
| `tests/modules/reputation.test.js` | Update tests for new level-up behavior |
| `tests/commands/rank.test.js` | Update config mocks to include `xp` section |

---

## Task 1: Config Wiring — xpDefaults + config.json + allowlist

**Files:**
- Create: `src/modules/xpDefaults.js`
- Modify: `config.json`
- Modify: `src/modules/reputationDefaults.js`
- Modify: `src/api/utils/configAllowlist.js`

- [ ] **Step 1: Create `src/modules/xpDefaults.js`**

```js
/**
 * Default XP / leveling configuration — single source of truth.
 * Imported by levelUpActions.js, reputation.js, rank.js, and API routes.
 */

export const XP_DEFAULTS = {
  enabled: false,
  levelThresholds: [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000],
  levelActions: [],
  defaultActions: [],
  roleRewards: {
    stackRoles: true,
    removeOnLevelDown: false,
  },
};
```

- [ ] **Step 2: Update `src/modules/reputationDefaults.js`**

Remove `announceChannelId`, `levelThresholds`, and `roleRewards`. The file becomes:

```js
/**
 * Default reputation configuration — single source of truth.
 * Imported by reputation.js, rank.js, and leaderboard.js.
 */

export const REPUTATION_DEFAULTS = {
  enabled: false,
  xpPerMessage: [5, 15],
  xpCooldownSeconds: 60,
};
```

- [ ] **Step 3: Add `xp` section to `config.json` and trim `reputation`**

Add the following top-level key to `config.json` (after the `reputation` section):

```json
"xp": {
  "enabled": false,
  "levelThresholds": [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000],
  "levelActions": [],
  "defaultActions": [],
  "roleRewards": {
    "stackRoles": true,
    "removeOnLevelDown": false
  }
}
```

Remove from the `reputation` section: `announceChannelId`, `levelThresholds`, `roleRewards`. The reputation section becomes:

```json
"reputation": {
  "enabled": false,
  "xpPerMessage": [5, 15],
  "xpCooldownSeconds": 60
}
```

- [ ] **Step 4: Add `'xp'` to `SAFE_CONFIG_KEYS` in `src/api/utils/configAllowlist.js`**

Add `'xp'` to the `SAFE_CONFIG_KEYS` Set (alphabetical order — after `'voice'`):

```js
export const SAFE_CONFIG_KEYS = new Set([
  'ai',
  'welcome',
  'spam',
  'moderation',
  'triage',
  'starboard',
  'permissions',
  'memory',
  'help',
  'announce',
  'snippet',
  'poll',
  'showcase',
  'tldr',
  'afk',
  'reputation',
  'engagement',
  'voice',
  'github',
  'challenges',
  'review',
  'auditLog',
  'reminders',
  'aiAutoMod',
  'botStatus',
  'quietMode',
  'xp',
]);
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/xpDefaults.js src/modules/reputationDefaults.js config.json src/api/utils/configAllowlist.js
git commit -m "feat(xp): add xp config section and defaults (#365)"
```

---

## Task 2: Template Engine — renderTemplate + validateLength

**Files:**
- Create: `tests/utils/templateEngine.test.js`
- Create: `src/utils/templateEngine.js`

- [ ] **Step 1: Write failing tests for `renderTemplate` and `validateLength`**

Create `tests/utils/templateEngine.test.js`:

```js
import { describe, expect, it } from 'vitest';

import { renderTemplate, validateLength } from '../../src/utils/templateEngine.js';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk vitest run tests/utils/templateEngine.test.js`

Expected: FAIL — `Cannot find module '../../src/utils/templateEngine.js'`

- [ ] **Step 3: Implement `renderTemplate` and `validateLength`**

Create `src/utils/templateEngine.js`:

```js
/**
 * Template Interpolation Engine
 * Replaces {{variable}} tokens in strings with values from a context object.
 * Used by level-up actions for DMs, announcements, embeds, and webhooks.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/367
 */

/** Matches `{{variableName}}` tokens. Only word characters allowed inside braces. */
const TEMPLATE_REGEX = /\{\{(\w+)\}\}/g;

/**
 * Replace `{{variable}}` tokens in a template string with values from context.
 * - Known variables with a value: replaced with the value.
 * - Known variables with null/undefined: replaced with empty string.
 * - Unknown tokens (key not in context): left as-is.
 *
 * @param {string} template - Template string with `{{variable}}` placeholders.
 * @param {Record<string, string | null | undefined>} context - Variable name → value map.
 * @returns {string} Rendered string.
 */
export function renderTemplate(template, context) {
  if (!template) return '';
  return template.replace(TEMPLATE_REGEX, (match, varName) => {
    if (!(varName in context)) return match;
    return context[varName] ?? '';
  });
}

/**
 * Check whether a string is within a character limit.
 *
 * @param {string} text - The text to validate.
 * @param {number} limit - Maximum allowed character count.
 * @returns {{ valid: boolean, length: number, limit: number }}
 */
export function validateLength(text, limit) {
  const length = text.length;
  return { valid: length <= limit, length, limit };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk vitest run tests/utils/templateEngine.test.js`

Expected: All 14 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/templateEngine.js tests/utils/templateEngine.test.js
git commit -m "feat(xp): add template interpolation engine (#367)"
```

---

## Task 3: Template Engine — buildTemplateContext

**Files:**
- Modify: `tests/utils/templateEngine.test.js`
- Modify: `src/utils/templateEngine.js`

- [ ] **Step 1: Write failing tests for `buildTemplateContext`**

Append to `tests/utils/templateEngine.test.js`:

```js
import { buildTemplateContext } from '../../src/utils/templateEngine.js';

// Add vi import at the top of the file
import { vi } from 'vitest';

// Add mock for db.js at the top of the file, before all imports:
vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({ rows: [] }),
  })),
}));
```

Then add this `describe` block:

```js
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
    expect(ctx.nextLevel).toBe('2,500');
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
    const guild = { name: 'S', iconURL: () => '', memberCount: 1 };

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
});
```

- [ ] **Step 2: Run tests to verify the new tests fail**

Run: `rtk vitest run tests/utils/templateEngine.test.js`

Expected: FAIL — `buildTemplateContext is not exported` or similar.

- [ ] **Step 3: Implement `buildTemplateContext`**

Add to `src/utils/templateEngine.js`:

```js
import { getPool } from '../db.js';

/**
 * Format a number with comma separators.
 *
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  return Number(n).toLocaleString('en-US');
}

/**
 * Collect all template variables from Discord objects and DB data.
 * DB queries (rank, messages, voiceHours, daysActive) fail gracefully — missing data
 * returns the documented fallback value.
 *
 * @param {Object} params
 * @param {import('discord.js').GuildMember} params.member
 * @param {import('discord.js').Message} params.message
 * @param {import('discord.js').Guild} params.guild
 * @param {number} params.level
 * @param {number} params.previousLevel
 * @param {number} params.xp
 * @param {number[]} params.levelThresholds
 * @param {string|null} params.roleName
 * @param {string|null} params.roleId
 * @returns {Promise<Record<string, string>>}
 */
export async function buildTemplateContext({
  member,
  message,
  guild,
  level,
  previousLevel,
  xp,
  levelThresholds,
  roleName,
  roleId,
}) {
  const nextThreshold = levelThresholds[level] ?? null;
  const xpToNext = nextThreshold !== null ? nextThreshold - xp : 0;

  // DB queries for rank, messages, voiceHours, daysActive — all best-effort
  let rank = '?';
  let messages = '0';
  let voiceHours = '0';
  let daysActive = '0';

  try {
    const pool = getPool();
    const guildId = guild.id ?? member.guild?.id;
    const userId = member.user.id;

    // Batch: rank + messages from reputation, daysActive from user_stats
    const [rankResult, statsResult] = await Promise.all([
      pool.query(
        'SELECT COUNT(*) + 1 AS rank FROM reputation WHERE guild_id = $1 AND xp > $2',
        [guildId, xp],
      ),
      pool.query(
        `SELECT
           r.messages_count,
           us.days_active,
           COALESCE(vs.total_seconds, 0) AS voice_seconds
         FROM reputation r
         LEFT JOIN user_stats us ON us.guild_id = r.guild_id AND us.user_id = r.user_id
         LEFT JOIN voice_stats vs ON vs.guild_id = r.guild_id AND vs.user_id = r.user_id
         WHERE r.guild_id = $1 AND r.user_id = $2`,
        [guildId, userId],
      ),
    ]);

    rank = `#${rankResult.rows[0]?.rank ?? 1}`;

    if (statsResult.rows[0]) {
      const row = statsResult.rows[0];
      messages = formatNumber(row.messages_count ?? 0);
      daysActive = String(row.days_active ?? 0);
      voiceHours = String(Math.round((row.voice_seconds ?? 0) / 3600 * 10) / 10);
    }
  } catch {
    // DB unavailable — use fallback values
  }

  return {
    username: member.user.displayName ?? '',
    mention: `<@${member.user.id}>`,
    avatar: member.user.displayAvatarURL?.() ?? '',
    level: String(level),
    previousLevel: String(previousLevel),
    xp: formatNumber(xp),
    xpToNext: formatNumber(Math.max(0, xpToNext)),
    nextLevel: nextThreshold !== null ? formatNumber(nextThreshold) : '0',
    server: guild.name ?? '',
    serverIcon: guild.iconURL?.() ?? '',
    memberCount: formatNumber(guild.memberCount ?? 0),
    channel: message.channel?.name ? `#${message.channel.name}` : '',
    rank,
    messages,
    roleName: roleName ?? '',
    roleMention: roleId ? `<@&${roleId}>` : '',
    voiceHours,
    daysActive,
    joinDate: member.joinedAt
      ? member.joinedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '',
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk vitest run tests/utils/templateEngine.test.js`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/templateEngine.js tests/utils/templateEngine.test.js
git commit -m "feat(xp): add buildTemplateContext with 20 variables (#367)"
```

---

## Task 4: Role Utilities — Permission Checks + Rate Limiter

**Files:**
- Create: `tests/modules/actions/roleUtils.test.js`
- Create: `src/modules/actions/roleUtils.js`

- [ ] **Step 1: Write failing tests for roleUtils**

Create `tests/modules/actions/roleUtils.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { warn } from '../../../src/logger.js';
import {
  canManageRole,
  checkRoleRateLimit,
  collectXpManagedRoles,
  recordRoleChange,
  sweepRoleLimits,
} from '../../../src/modules/actions/roleUtils.js';

function makeGuild({ hasManageRoles = true, botHighestPosition = 10 } = {}) {
  return {
    id: 'guild1',
    members: {
      me: {
        permissions: { has: vi.fn(() => hasManageRoles) },
        roles: { highest: { position: botHighestPosition } },
      },
    },
    roles: {
      cache: new Map([
        ['role-low', { id: 'role-low', position: 5, name: 'Low Role' }],
        ['role-high', { id: 'role-high', position: 15, name: 'High Role' }],
        ['role-equal', { id: 'role-equal', position: 10, name: 'Equal Role' }],
      ]),
    },
  };
}

describe('canManageRole', () => {
  it('should return true when bot has MANAGE_ROLES and role is below bot highest', () => {
    const guild = makeGuild();
    expect(canManageRole(guild, 'role-low')).toBe(true);
  });

  it('should return false when bot lacks MANAGE_ROLES', () => {
    const guild = makeGuild({ hasManageRoles: false });
    expect(canManageRole(guild, 'role-low')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('MANAGE_ROLES'),
      expect.any(Object),
    );
  });

  it('should return false when role is above bot highest role', () => {
    const guild = makeGuild();
    expect(canManageRole(guild, 'role-high')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('hierarchy'),
      expect.any(Object),
    );
  });

  it('should return false when role is at same position as bot highest', () => {
    const guild = makeGuild();
    expect(canManageRole(guild, 'role-equal')).toBe(false);
  });

  it('should return false when role is not in guild cache', () => {
    const guild = makeGuild();
    expect(canManageRole(guild, 'role-missing')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
      expect.any(Object),
    );
  });
});

describe('checkRoleRateLimit / recordRoleChange', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow first two role changes', () => {
    expect(checkRoleRateLimit('guild1', 'user1')).toBe(true);
    recordRoleChange('guild1', 'user1');
    expect(checkRoleRateLimit('guild1', 'user1')).toBe(true);
    recordRoleChange('guild1', 'user1');
  });

  it('should block third role change within 60s', () => {
    recordRoleChange('guild1', 'user-rl');
    recordRoleChange('guild1', 'user-rl');
    expect(checkRoleRateLimit('guild1', 'user-rl')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('rate limit'),
      expect.any(Object),
    );
  });

  it('should allow role change after 60s window expires', () => {
    recordRoleChange('guild1', 'user-exp');
    recordRoleChange('guild1', 'user-exp');
    vi.advanceTimersByTime(61_000);
    expect(checkRoleRateLimit('guild1', 'user-exp')).toBe(true);
  });
});

describe('sweepRoleLimits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should remove stale entries older than 60s', () => {
    recordRoleChange('guild1', 'user-sweep');
    vi.advanceTimersByTime(61_000);
    sweepRoleLimits();
    // After sweep, rate limit should be clear
    expect(checkRoleRateLimit('guild1', 'user-sweep')).toBe(true);
  });
});

describe('collectXpManagedRoles', () => {
  it('should return all roleIds from grantRole and removeRole actions in levelActions', () => {
    const config = {
      levelActions: [
        { level: 5, actions: [{ type: 'grantRole', roleId: 'role-a' }] },
        { level: 10, actions: [
          { type: 'grantRole', roleId: 'role-b' },
          { type: 'removeRole', roleId: 'role-a' },
          { type: 'sendDm', message: 'hello' },
        ]},
      ],
      defaultActions: [{ type: 'addReaction', emoji: '⬆️' }],
    };

    const roles = collectXpManagedRoles(config);
    expect(roles).toEqual(new Set(['role-a', 'role-b']));
  });

  it('should return empty set when no role actions exist', () => {
    const config = { levelActions: [], defaultActions: [] };
    expect(collectXpManagedRoles(config)).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk vitest run tests/modules/actions/roleUtils.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement roleUtils**

Create `src/modules/actions/roleUtils.js`:

```js
/**
 * Role Action Utilities
 * Permission checks, rate limiting, and shared role logic for XP level-up actions.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/366
 */

import { warn } from '../../logger.js';

/** Max role changes per user per window. */
const MAX_ROLE_CHANGES = 2;

/** Sliding window duration in milliseconds. */
const RATE_WINDOW_MS = 60_000;

/**
 * In-memory rate limiter: `${guildId}:${userId}` → array of timestamps.
 * @type {Map<string, number[]>}
 */
const roleLimits = new Map();

/**
 * Check whether the bot can manage a specific role in a guild.
 * Logs a warning and returns false if the bot lacks permissions or the role is too high.
 *
 * @param {import('discord.js').Guild} guild
 * @param {string} roleId
 * @returns {boolean}
 */
export function canManageRole(guild, roleId) {
  const me = guild.members.me;
  if (!me.permissions.has('ManageRoles')) {
    warn('Cannot manage role — bot lacks MANAGE_ROLES permission', {
      guildId: guild.id,
      roleId,
    });
    return false;
  }

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    warn('Cannot manage role — role not found in guild cache', {
      guildId: guild.id,
      roleId,
    });
    return false;
  }

  if (role.position >= me.roles.highest.position) {
    warn('Cannot manage role — role at or above bot in hierarchy', {
      guildId: guild.id,
      roleId,
      rolePosition: role.position,
      botHighest: me.roles.highest.position,
    });
    return false;
  }

  return true;
}

/**
 * Check whether a role change is allowed under the rate limit.
 * Does NOT record the change — call `recordRoleChange` after a successful change.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {boolean} true if the change is allowed.
 */
export function checkRoleRateLimit(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const timestamps = roleLimits.get(key);
  if (!timestamps) return true;

  const now = Date.now();
  const recent = timestamps.filter((ts) => now - ts < RATE_WINDOW_MS);
  roleLimits.set(key, recent);

  if (recent.length >= MAX_ROLE_CHANGES) {
    warn('Role change rate limit exceeded — skipping', {
      guildId,
      userId,
      recentChanges: recent.length,
      windowMs: RATE_WINDOW_MS,
    });
    return false;
  }

  return true;
}

/**
 * Record a successful role change for rate limiting.
 *
 * @param {string} guildId
 * @param {string} userId
 */
export function recordRoleChange(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const timestamps = roleLimits.get(key) ?? [];
  timestamps.push(Date.now());
  roleLimits.set(key, timestamps);
}

/**
 * Evict stale rate limit entries. Call periodically to prevent memory leaks.
 * Exported for testability.
 */
export function sweepRoleLimits() {
  const now = Date.now();
  for (const [key, timestamps] of roleLimits) {
    const recent = timestamps.filter((ts) => now - ts < RATE_WINDOW_MS);
    if (recent.length === 0) {
      roleLimits.delete(key);
    } else {
      roleLimits.set(key, recent);
    }
  }
}

// Periodic sweep — same pattern as reputation.js cooldowns.
setInterval(sweepRoleLimits, 5 * 60 * 1000).unref();

/**
 * Collect all role IDs managed by XP level actions (grantRole / removeRole).
 * Used for stack-vs-replace logic.
 *
 * @param {Object} config - The resolved `config.xp` section.
 * @returns {Set<string>} Set of role IDs.
 */
export function collectXpManagedRoles(config) {
  const roleIds = new Set();
  for (const entry of config.levelActions ?? []) {
    for (const action of entry.actions ?? []) {
      if ((action.type === 'grantRole' || action.type === 'removeRole') && action.roleId) {
        roleIds.add(action.roleId);
      }
    }
  }
  return roleIds;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk vitest run tests/modules/actions/roleUtils.test.js`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/actions/roleUtils.js tests/modules/actions/roleUtils.test.js
git commit -m "feat(xp): add role permission checks and rate limiter (#366)"
```

---

## Task 5: grantRole Action Handler

**Files:**
- Create: `tests/modules/actions/grantRole.test.js`
- Create: `src/modules/actions/grantRole.js`

- [ ] **Step 1: Write failing tests**

Create `tests/modules/actions/grantRole.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/actions/roleUtils.js', () => ({
  canManageRole: vi.fn(() => true),
  checkRoleRateLimit: vi.fn(() => true),
  recordRoleChange: vi.fn(),
}));

import { info } from '../../../src/logger.js';
import {
  canManageRole,
  checkRoleRateLimit,
  recordRoleChange,
} from '../../../src/modules/actions/roleUtils.js';
import { handleGrantRole } from '../../../src/modules/actions/grantRole.js';

function makeContext({
  memberRoles = new Map(),
  xpManagedRoles = new Set(),
  stackRoles = true,
} = {}) {
  const rolesAdd = vi.fn().mockResolvedValue(undefined);
  const rolesRemove = vi.fn().mockResolvedValue(undefined);

  return {
    member: {
      roles: {
        add: rolesAdd,
        remove: rolesRemove,
        cache: memberRoles,
      },
    },
    guild: {
      id: 'guild1',
      roles: {
        cache: new Map([
          ['role-a', { id: 'role-a', name: 'Role A' }],
          ['role-b', { id: 'role-b', name: 'Role B' }],
        ]),
      },
    },
    config: {
      roleRewards: { stackRoles },
    },
    xpManagedRoles,
    templateContext: {},
    _mocks: { rolesAdd, rolesRemove },
  };
}

describe('handleGrantRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add the role to the member', async () => {
    const ctx = makeContext();
    await handleGrantRole({ type: 'grantRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-a');
    expect(recordRoleChange).toHaveBeenCalledWith('guild1', undefined);
  });

  it('should update templateContext with roleName and roleId', async () => {
    const ctx = makeContext();
    await handleGrantRole({ type: 'grantRole', roleId: 'role-a' }, ctx);

    expect(ctx.templateContext.roleName).toBe('Role A');
    expect(ctx.templateContext.roleId).toBe('role-a');
    expect(ctx.templateContext.roleMention).toBe('<@&role-a>');
  });

  it('should skip when canManageRole returns false', async () => {
    canManageRole.mockReturnValueOnce(false);
    const ctx = makeContext();
    await handleGrantRole({ type: 'grantRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesAdd).not.toHaveBeenCalled();
  });

  it('should skip when rate limited', async () => {
    checkRoleRateLimit.mockReturnValueOnce(false);
    const ctx = makeContext();
    await handleGrantRole({ type: 'grantRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesAdd).not.toHaveBeenCalled();
  });

  it('should remove other XP-managed roles when stackRoles is false', async () => {
    const memberRoles = new Map([
      ['role-a', { id: 'role-a' }],
      ['role-b', { id: 'role-b' }],
      ['role-unrelated', { id: 'role-unrelated' }],
    ]);
    const xpManagedRoles = new Set(['role-a', 'role-b']);
    const ctx = makeContext({ memberRoles, xpManagedRoles, stackRoles: false });

    await handleGrantRole({ type: 'grantRole', roleId: 'role-b' }, ctx);

    // Should remove role-a (XP-managed, not the target) but NOT role-unrelated
    expect(ctx._mocks.rolesRemove).toHaveBeenCalledWith('role-a');
    expect(ctx._mocks.rolesRemove).not.toHaveBeenCalledWith('role-unrelated');
    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-b');
  });

  it('should not remove other roles when stackRoles is true', async () => {
    const memberRoles = new Map([['role-a', { id: 'role-a' }]]);
    const xpManagedRoles = new Set(['role-a', 'role-b']);
    const ctx = makeContext({ memberRoles, xpManagedRoles, stackRoles: true });

    await handleGrantRole({ type: 'grantRole', roleId: 'role-b' }, ctx);

    expect(ctx._mocks.rolesRemove).not.toHaveBeenCalled();
    expect(ctx._mocks.rolesAdd).toHaveBeenCalledWith('role-b');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk vitest run tests/modules/actions/grantRole.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement grantRole**

Create `src/modules/actions/grantRole.js`:

```js
/**
 * grantRole Action Handler
 * Adds a Discord role to the member who leveled up.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/366
 */

import { info } from '../../logger.js';
import { canManageRole, checkRoleRateLimit, recordRoleChange } from './roleUtils.js';

/**
 * Grant a role to the member.
 * In replace mode (stackRoles: false), removes all other XP-managed roles first.
 *
 * @param {Object} action - { type: "grantRole", roleId: string }
 * @param {Object} context - Pipeline context
 */
export async function handleGrantRole(action, context) {
  const { member, guild, config, xpManagedRoles, templateContext } = context;
  const { roleId } = action;

  if (!canManageRole(guild, roleId)) return;
  if (!checkRoleRateLimit(guild.id, member.user?.id)) return;

  // Replace mode: remove other XP-managed roles before granting
  if (!config.roleRewards.stackRoles) {
    for (const [id] of member.roles.cache) {
      if (xpManagedRoles.has(id) && id !== roleId) {
        await member.roles.remove(id);
      }
    }
  }

  await member.roles.add(roleId);
  recordRoleChange(guild.id, member.user?.id);

  // Update template context for downstream actions
  const role = guild.roles.cache.get(roleId);
  templateContext.roleName = role?.name ?? '';
  templateContext.roleId = roleId;
  templateContext.roleMention = `<@&${roleId}>`;

  info('Level-up role granted', {
    guildId: guild.id,
    userId: member.user?.id,
    roleId,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk vitest run tests/modules/actions/grantRole.test.js`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/actions/grantRole.js tests/modules/actions/grantRole.test.js
git commit -m "feat(xp): add grantRole action handler (#366)"
```

---

## Task 6: removeRole Action Handler

**Files:**
- Create: `tests/modules/actions/removeRole.test.js`
- Create: `src/modules/actions/removeRole.js`

- [ ] **Step 1: Write failing tests**

Create `tests/modules/actions/removeRole.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../../src/modules/actions/roleUtils.js', () => ({
  canManageRole: vi.fn(() => true),
  checkRoleRateLimit: vi.fn(() => true),
  recordRoleChange: vi.fn(),
}));

import {
  canManageRole,
  checkRoleRateLimit,
  recordRoleChange,
} from '../../../src/modules/actions/roleUtils.js';
import { handleRemoveRole } from '../../../src/modules/actions/removeRole.js';

function makeContext() {
  const rolesRemove = vi.fn().mockResolvedValue(undefined);
  return {
    member: {
      user: { id: 'user1' },
      roles: { remove: rolesRemove },
    },
    guild: { id: 'guild1' },
    config: {},
    _mocks: { rolesRemove },
  };
}

describe('handleRemoveRole', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should remove the role from the member', async () => {
    const ctx = makeContext();
    await handleRemoveRole({ type: 'removeRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesRemove).toHaveBeenCalledWith('role-a');
    expect(recordRoleChange).toHaveBeenCalledWith('guild1', 'user1');
  });

  it('should skip when canManageRole returns false', async () => {
    canManageRole.mockReturnValueOnce(false);
    const ctx = makeContext();
    await handleRemoveRole({ type: 'removeRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesRemove).not.toHaveBeenCalled();
  });

  it('should skip when rate limited', async () => {
    checkRoleRateLimit.mockReturnValueOnce(false);
    const ctx = makeContext();
    await handleRemoveRole({ type: 'removeRole', roleId: 'role-a' }, ctx);

    expect(ctx._mocks.rolesRemove).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk vitest run tests/modules/actions/removeRole.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement removeRole**

Create `src/modules/actions/removeRole.js`:

```js
/**
 * removeRole Action Handler
 * Removes a Discord role from the member who leveled up.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/366
 */

import { info } from '../../logger.js';
import { canManageRole, checkRoleRateLimit, recordRoleChange } from './roleUtils.js';

/**
 * Remove a role from the member.
 *
 * @param {Object} action - { type: "removeRole", roleId: string }
 * @param {Object} context - Pipeline context
 */
export async function handleRemoveRole(action, context) {
  const { member, guild } = context;
  const { roleId } = action;

  if (!canManageRole(guild, roleId)) return;
  if (!checkRoleRateLimit(guild.id, member.user?.id)) return;

  await member.roles.remove(roleId);
  recordRoleChange(guild.id, member.user?.id);

  info('Level-up role removed', {
    guildId: guild.id,
    userId: member.user?.id,
    roleId,
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk vitest run tests/modules/actions/removeRole.test.js`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/actions/removeRole.js tests/modules/actions/removeRole.test.js
git commit -m "feat(xp): add removeRole action handler (#366)"
```

---

## Task 7: Pipeline Engine — levelUpActions.js

**Files:**
- Create: `tests/modules/levelUpActions.test.js`
- Create: `src/modules/levelUpActions.js`

- [ ] **Step 1: Write failing tests for the pipeline engine**

Create `tests/modules/levelUpActions.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk vitest run tests/modules/levelUpActions.test.js`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the pipeline engine**

Create `src/modules/levelUpActions.js`:

```js
/**
 * Level-Up Action Pipeline
 * Executes an ordered list of configurable actions when a user levels up.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/365
 */

import { info, warn } from '../logger.js';
import { buildTemplateContext } from '../utils/templateEngine.js';
import { handleGrantRole } from './actions/grantRole.js';
import { handleRemoveRole } from './actions/removeRole.js';
import { collectXpManagedRoles } from './actions/roleUtils.js';

/**
 * Action handler registry: action type → async handler function.
 * @type {Map<string, (action: Object, context: Object) => Promise<void>>}
 */
const actionRegistry = new Map();

/**
 * Register an action handler for a given type.
 * Used internally for built-in actions and externally for Phase 2 additions.
 *
 * @param {string} type - Action type identifier (e.g. 'grantRole').
 * @param {(action: Object, context: Object) => Promise<void>} handler
 */
export function registerAction(type, handler) {
  actionRegistry.set(type, handler);
}

// Register Phase 1 action handlers
registerAction('grantRole', handleGrantRole);
registerAction('removeRole', handleRemoveRole);

/**
 * Resolve the ordered list of actions to execute for a level-up.
 * Handles level skips by collecting actions for every crossed level.
 *
 * @param {number} previousLevel
 * @param {number} newLevel
 * @param {Object} config - The resolved `config.xp` section.
 * @returns {Array<{level: number, action: Object}>} Ordered action list.
 */
export function resolveActions(previousLevel, newLevel, config) {
  if (newLevel <= previousLevel) return [];

  const levelActionsMap = new Map();
  for (const entry of config.levelActions ?? []) {
    levelActionsMap.set(entry.level, entry.actions ?? []);
  }

  const result = [];
  for (let level = previousLevel + 1; level <= newLevel; level++) {
    const actions = levelActionsMap.has(level)
      ? levelActionsMap.get(level)
      : (config.defaultActions ?? []);

    for (const action of actions) {
      result.push({ level, action });
    }
  }

  return result;
}

/**
 * Execute the level-up action pipeline for a user who just leveled up.
 * Actions run sequentially. Failures are logged and skipped — the pipeline never throws.
 *
 * @param {Object} params
 * @param {import('discord.js').GuildMember} params.member
 * @param {import('discord.js').Message} params.message
 * @param {import('discord.js').Guild} params.guild
 * @param {number} params.previousLevel
 * @param {number} params.newLevel
 * @param {number} params.xp
 * @param {Object} params.config - The resolved `config.xp` section.
 */
export async function executeLevelUpPipeline({
  member,
  message,
  guild,
  previousLevel,
  newLevel,
  xp,
  config,
}) {
  const actions = resolveActions(previousLevel, newLevel, config);
  if (actions.length === 0) return;

  info('Executing level-up pipeline', {
    guildId: guild.id,
    userId: member.user?.id,
    previousLevel,
    newLevel,
    actionCount: actions.length,
  });

  // Build template context once for all actions
  const templateContext = await buildTemplateContext({
    member,
    message,
    guild,
    level: newLevel,
    previousLevel,
    xp,
    levelThresholds: config.levelThresholds ?? [],
    roleName: null,
    roleId: null,
  });

  // Compute XP-managed roles once for stack/replace logic
  const xpManagedRoles = collectXpManagedRoles(config);

  const pipelineContext = {
    member,
    message,
    guild,
    previousLevel,
    newLevel,
    xp,
    config,
    templateContext,
    xpManagedRoles,
  };

  for (const { level, action } of actions) {
    const handler = actionRegistry.get(action.type);
    if (!handler) {
      warn('Unknown action type — skipping', {
        actionType: action.type,
        level,
        guildId: guild.id,
      });
      continue;
    }

    try {
      await handler(action, { ...pipelineContext, currentLevel: level });
    } catch (err) {
      warn('Action failed in level-up pipeline — continuing', {
        actionType: action.type,
        level,
        guildId: guild.id,
        userId: member.user?.id,
        error: err.message,
      });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk vitest run tests/modules/levelUpActions.test.js`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/levelUpActions.js tests/modules/levelUpActions.test.js
git commit -m "feat(xp): add level-up action pipeline engine (#365)"
```

---

## Task 8: Wire Pipeline Into reputation.js + Update Consumers

**Files:**
- Modify: `src/modules/reputation.js`
- Modify: `src/commands/rank.js`
- Modify: `src/api/routes/community.js`
- Modify: `src/api/routes/members.js`

- [ ] **Step 1: Update `src/modules/reputation.js`**

Replace the imports at the top. Remove `EmbedBuilder`, `safeSend`, `sanitizeMentions`. Add `executeLevelUpPipeline` and `XP_DEFAULTS`:

```js
/**
 * Reputation / XP Module
 * Gamified XP system that rewards community participation with levels and role rewards.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/45
 */

import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';
import { invalidateReputationCache } from '../utils/reputationCache.js';
import { getConfig } from './config.js';
import { executeLevelUpPipeline } from './levelUpActions.js';
import { REPUTATION_DEFAULTS } from './reputationDefaults.js';
import { XP_DEFAULTS } from './xpDefaults.js';
```

Update `getRepConfig` — it no longer merges `levelThresholds`:

```js
function getRepConfig(guildId) {
  const cfg = getConfig(guildId);
  return { ...REPUTATION_DEFAULTS, ...cfg.reputation };
}
```

Add a new `getXpConfig` function:

```js
/**
 * Resolve the XP config for a guild, merging defaults.
 *
 * @param {string} guildId
 * @returns {object}
 */
function getXpConfig(guildId) {
  const cfg = getConfig(guildId);
  return { ...XP_DEFAULTS, ...cfg.xp };
}
```

Update `handleXpGain` — read thresholds from XP config, replace lines 120–210 (the level-up block):

The line `const thresholds = repCfg.levelThresholds;` (line 121) becomes:

```js
  const xpCfg = getXpConfig(message.guild.id);
  const thresholds = xpCfg.levelThresholds;
```

Replace the entire `if (newLevel > currentLevel)` block (lines 124–210) with:

```js
  if (newLevel > currentLevel) {
    try {
      await pool.query('UPDATE reputation SET level = $1 WHERE guild_id = $2 AND user_id = $3', [
        newLevel,
        message.guild.id,
        message.author.id,
      ]);
    } catch (err) {
      logError('Failed to update level', {
        userId: message.author.id,
        guildId: message.guild.id,
        error: err.message,
      });
      return;
    }

    info('User leveled up', {
      userId: message.author.id,
      guildId: message.guild.id,
      level: newLevel,
      xp: newXp,
    });

    if (xpCfg.enabled) {
      executeLevelUpPipeline({
        member: message.member,
        message,
        guild: message.guild,
        previousLevel: currentLevel,
        newLevel,
        xp: newXp,
        config: xpCfg,
      }).catch(() => {}); // fire-and-forget, errors logged internally
    }
  }
```

- [ ] **Step 2: Update `src/commands/rank.js`**

Add import for `XP_DEFAULTS`:

```js
import { XP_DEFAULTS } from '../modules/xpDefaults.js';
```

Change line 48–49 from:

```js
    const repCfg = { ...REPUTATION_DEFAULTS, ...cfg.reputation };
    const thresholds = repCfg.levelThresholds;
```

to:

```js
    const repCfg = { ...REPUTATION_DEFAULTS, ...cfg.reputation };
    const xpCfg = { ...XP_DEFAULTS, ...cfg.xp };
    const thresholds = xpCfg.levelThresholds;
```

- [ ] **Step 3: Update `src/api/routes/community.js`**

Add import:

```js
import { XP_DEFAULTS } from '../../modules/xpDefaults.js';
```

Update the existing `getRepConfig` helper to NOT include `levelThresholds` (it's now in XP config). Add:

```js
function getXpConfig(guildId) {
  const cfg = getConfig(guildId);
  return { ...XP_DEFAULTS, ...cfg.xp };
}
```

Replace every `repConfig.levelThresholds` reference with `getXpConfig(guildId).levelThresholds`. There are references at approximately lines 148, 191, 203, 205–206, 461, 507, 674, 695–699. Each call to `getRepConfig` that then accesses `.levelThresholds` should instead use `getXpConfig`.

- [ ] **Step 4: Update `src/api/routes/members.js`**

Add import:

```js
import { XP_DEFAULTS } from '../../modules/xpDefaults.js';
```

Add helper:

```js
function getXpConfig(guildId) {
  const cfg = getConfig(guildId);
  return { ...XP_DEFAULTS, ...cfg.xp };
}
```

Replace `repConfig.levelThresholds` references (around lines 663–666, 982–983) with `getXpConfig(guildId).levelThresholds`.

At the XP adjustment endpoint (around line 986), after the level is recomputed, add a call to `enforceRoleLevelDown` when XP was reduced and the level dropped:

```js
// After COMMIT, if level went down and removeOnLevelDown is enabled, revoke roles
if (amount < 0 && newLevel < rows[0].level) {
  const xpConfig = getXpConfig(guildId);
  if (xpConfig.enabled && xpConfig.roleRewards.removeOnLevelDown) {
    try {
      const member = await req.guild.members.fetch(userId);
      const { enforceRoleLevelDown } = await import('../../modules/actions/roleUtils.js');
      await enforceRoleLevelDown(member, newLevel, xpConfig);
    } catch (err) {
      logError('Failed to enforce role level-down', {
        guildId, userId, newLevel, error: err.message,
      });
    }
  }
}
```

- [ ] **Step 5: Add `enforceRoleLevelDown` to roleUtils.js**

Add to `src/modules/actions/roleUtils.js`:

```js
/**
 * Remove roles granted at levels above the new level.
 * Called when XP is manually reduced and removeOnLevelDown is enabled.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {number} newLevel
 * @param {Object} xpConfig - The resolved `config.xp` section.
 */
export async function enforceRoleLevelDown(member, newLevel, xpConfig) {
  const guild = member.guild;

  for (const entry of xpConfig.levelActions ?? []) {
    if (entry.level <= newLevel) continue;

    for (const action of entry.actions ?? []) {
      if (action.type !== 'grantRole' || !action.roleId) continue;
      if (!member.roles.cache.has(action.roleId)) continue;
      if (!canManageRole(guild, action.roleId)) continue;
      if (!checkRoleRateLimit(guild.id, member.user.id)) continue;

      await member.roles.remove(action.roleId);
      recordRoleChange(guild.id, member.user.id);
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/reputation.js src/commands/rank.js src/api/routes/community.js src/api/routes/members.js src/modules/actions/roleUtils.js
git commit -m "feat(xp): wire pipeline into reputation.js and update consumers (#365)"
```

---

## Task 9: Update Existing Tests

**Files:**
- Modify: `tests/modules/reputation.test.js`
- Modify: `tests/commands/rank.test.js`
- Modify: `tests/modules/actions/roleUtils.test.js` (add enforceRoleLevelDown tests)

- [ ] **Step 1: Update `tests/modules/reputation.test.js`**

The test file needs these changes:

1. Remove mock for `discord.js` `EmbedBuilder` (no longer imported by reputation.js).
2. Remove mock for `safeSend` (no longer imported).
3. Add mock for `levelUpActions.js`:
   ```js
   vi.mock('../../src/modules/levelUpActions.js', () => ({
     executeLevelUpPipeline: vi.fn().mockResolvedValue(undefined),
   }));
   ```
4. Add mock for `xpDefaults.js`:
   ```js
   vi.mock('../../src/modules/xpDefaults.js', () => ({
     XP_DEFAULTS: {
       enabled: true,
       levelThresholds: [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000],
       levelActions: [],
       defaultActions: [],
       roleRewards: { stackRoles: true, removeOnLevelDown: false },
     },
   }));
   ```
5. Update `getConfig` mock returns: remove `announceChannelId`, `roleRewards`, `levelThresholds` from the `reputation` section. Add `xp` section with `levelThresholds`.
6. Update the level-up test to check `executeLevelUpPipeline` was called instead of `safeSend`:
   ```js
   import { executeLevelUpPipeline } from '../../src/modules/levelUpActions.js';
   // ...
   expect(executeLevelUpPipeline).toHaveBeenCalledWith(
     expect.objectContaining({ previousLevel: 0, newLevel: 1 }),
   );
   ```
7. Remove tests for `safeSend`, role add, and announcement embed — these are now tested in the action handler tests.
8. Remove `safeSend` import.
9. Remove `makeMessage` channelCache parameter since it's no longer needed for announcements.

- [ ] **Step 2: Update `tests/commands/rank.test.js`**

Add mock for `xpDefaults.js` and update config mock to include `xp` section with `levelThresholds`. Remove `levelThresholds` from the `reputation` mock if present.

- [ ] **Step 3: Add `enforceRoleLevelDown` tests to `tests/modules/actions/roleUtils.test.js`**

Append:

```js
import { enforceRoleLevelDown } from '../../../src/modules/actions/roleUtils.js';

describe('enforceRoleLevelDown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should remove roles granted at levels above newLevel', async () => {
    const rolesRemove = vi.fn().mockResolvedValue(undefined);
    const member = {
      user: { id: 'user1' },
      guild: makeGuild(),
      roles: {
        cache: new Map([['role-low', { id: 'role-low' }]]),
        remove: rolesRemove,
      },
    };

    const xpConfig = {
      levelActions: [
        { level: 5, actions: [{ type: 'grantRole', roleId: 'role-low' }] },
        { level: 10, actions: [{ type: 'grantRole', roleId: 'role-high' }] },
      ],
    };

    // User dropped to level 7 — should remove role-low only if level > 7
    // role-low is at level 5 (≤7), so keep it. role-high is at level 10 (>7), but member doesn't have it.
    await enforceRoleLevelDown(member, 7, xpConfig);
    expect(rolesRemove).not.toHaveBeenCalled();

    // Now test where member has role from level 10 and drops to level 3
    member.roles.cache.set('role-low', { id: 'role-low' });
    await enforceRoleLevelDown(member, 3, xpConfig);
    // role-low is at level 5 (>3), member has it → remove
    expect(rolesRemove).toHaveBeenCalledWith('role-low');
  });
});
```

- [ ] **Step 4: Run all tests**

Run: `rtk vitest run tests/modules/reputation.test.js tests/commands/rank.test.js tests/modules/actions/roleUtils.test.js`

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/modules/reputation.test.js tests/commands/rank.test.js tests/modules/actions/roleUtils.test.js
git commit -m "test(xp): update existing tests for pipeline integration (#365)"
```

---

## Task 10: Full Validation + Final Commit

- [ ] **Step 1: Run full lint, typecheck, and test suite**

```bash
rtk pnpm mono:lint && rtk pnpm mono:typecheck && rtk pnpm mono:test
```

Expected: All pass. Fix any failures before proceeding.

- [ ] **Step 2: Run test coverage**

```bash
rtk pnpm mono:test:coverage
```

Expected: Coverage stays above 85% thresholds. New files should have high coverage from the per-task tests.

- [ ] **Step 3: Verify config.json structure**

Read `config.json` and verify:
- `reputation` section has only `enabled`, `xpPerMessage`, `xpCooldownSeconds`
- `xp` section exists with `enabled`, `levelThresholds`, `levelActions`, `defaultActions`, `roleRewards`

- [ ] **Step 4: Verify SAFE_CONFIG_KEYS**

Read `src/api/utils/configAllowlist.js` and verify `'xp'` is in the `SAFE_CONFIG_KEYS` Set.

- [ ] **Step 5: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(xp): address lint/test issues from Phase 1 integration"
```
