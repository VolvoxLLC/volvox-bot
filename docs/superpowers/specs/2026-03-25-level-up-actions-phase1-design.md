# Phase 1: Level-Up Action Pipeline Engine

**Issues:** #365 (pipeline engine), #366 (role actions), #367 (template engine)
**Parent:** #364 (auto-assign roles on level-up with dashboard configuration)

## Overview

Replace the inline level-up side-effects in `reputation.js` (role grant + channel announcement) with a configurable action pipeline. Phase 1 delivers the pipeline executor, role grant/remove actions, and the template interpolation engine.

## Config Structure

New top-level `config.xp` section. The existing `config.reputation` is trimmed to XP gain mechanics only — `roleRewards`, `announceChannelId`, and `levelThresholds` are removed from it.

```json
{
  "xp": {
    "enabled": true,
    "levelThresholds": [100, 300, 600, 1000, 1500, 2500, 4000, 6000, 8500, 12000],
    "levelActions": [
      {
        "level": 5,
        "actions": [
          { "type": "grantRole", "roleId": "123456789" }
        ]
      }
    ],
    "defaultActions": [
      { "type": "addReaction", "emoji": "⬆️" }
    ],
    "roleRewards": {
      "stackRoles": true,
      "removeOnLevelDown": false
    }
  }
}
```

`config.reputation` after trimming:

```json
{
  "reputation": {
    "enabled": false,
    "xpPerMessage": [5, 15],
    "xpCooldownSeconds": 60
  }
}
```

### Config Wiring

- Add `'xp'` to `SAFE_CONFIG_KEYS` in `src/api/utils/configAllowlist.js`.
- Add `xp` section to `config.json` with defaults (enabled: false, empty actions).
- Create `src/modules/xpDefaults.js` with default XP config values.
- Update `reputationDefaults.js` — remove `roleRewards`, `announceChannelId`, `levelThresholds`.
- Gate the pipeline behind `config.xp.enabled`.

## Component 1: Pipeline Engine

**File:** `src/modules/levelUpActions.js`

### Core Function

```js
/**
 * Execute the level-up action pipeline for a user who just leveled up.
 *
 * @param {Object} context
 * @param {import('discord.js').GuildMember} context.member
 * @param {import('discord.js').Message} context.message
 * @param {import('discord.js').Guild} context.guild
 * @param {number} context.previousLevel
 * @param {number} context.newLevel
 * @param {number} context.xp
 * @param {Object} context.config - The resolved xp config section
 */
export async function executeLevelUpPipeline(context)
```

### Action Resolution

1. Compute all crossed levels: range from `previousLevel + 1` to `newLevel` inclusive.
2. For each crossed level (in ascending order):
   - If `config.xp.levelActions` has an entry for that level, use its `actions` array.
   - Otherwise, use `config.xp.defaultActions`.
3. Flatten into a single ordered list of `{ level, action }` pairs.

### Execution

- Execute actions sequentially (order matters — role grant before announcement).
- Each action is wrapped in try/catch — on failure, log a warning with action type + level + error, continue to next.
- The pipeline itself never throws — errors are fully contained.
- Fire-and-forget from `reputation.js` perspective.

### Action Registry

```js
/** @type {Map<string, (action: Object, context: PipelineContext) => Promise<void>>} */
const actionRegistry = new Map();

export function registerAction(type, handler) {
  actionRegistry.set(type, handler);
}
```

Phase 1 registers `grantRole` and `removeRole`. Phase 2 adds the remaining 6 types by calling `registerAction()` — no pipeline changes needed.

### XP-Managed Roles

Computed once per pipeline execution by scanning all `levelActions` entries for `grantRole`/`removeRole` action types. This set is passed to role handlers for stack-mode logic.

## Component 2: Template Engine

**File:** `src/utils/templateEngine.js`

### renderTemplate

```js
/**
 * Replace {{variable}} tokens in a template string with values from context.
 *
 * @param {string} template - Template string with {{variable}} placeholders
 * @param {Record<string, string>} context - Variable name → value map
 * @returns {string} Rendered string
 */
export function renderTemplate(template, context)
```

- Regex: `/\{\{(\w+)\}\}/g`
- Known variables with a value: replaced with the value.
- Known variables with null/undefined value: replaced with empty string.
- Unknown tokens (not in context keys): left as-is (preserves literal `{{` in user text).
- Stateless, pure function — no side effects.

### buildTemplateContext

```js
/**
 * Collect all 20 template variables from Discord objects and DB data.
 *
 * @param {Object} params
 * @param {import('discord.js').GuildMember} params.member
 * @param {import('discord.js').Message} params.message
 * @param {import('discord.js').Guild} params.guild
 * @param {number} params.level
 * @param {number} params.previousLevel
 * @param {number} params.xp
 * @param {number[]} params.levelThresholds
 * @param {string|null} params.roleName - Name of granted role, if any
 * @param {string|null} params.roleId - ID of granted role, if any
 * @returns {Promise<Record<string, string>>}
 */
export async function buildTemplateContext(params)
```

### Variable Sources

| Variable | Source | Fallback |
|----------|--------|----------|
| `username` | `member.user.displayName` | `""` |
| `mention` | `<@${member.user.id}>` | `""` |
| `avatar` | `member.user.displayAvatarURL()` | `""` |
| `level` | passed directly | `"0"` |
| `previousLevel` | passed directly | `"0"` |
| `xp` | passed directly, formatted with commas | `"0"` |
| `xpToNext` | computed: next threshold - current xp | `"0"` |
| `nextLevel` | computed: next threshold value | `"0"` |
| `server` | `guild.name` | `""` |
| `serverIcon` | `guild.iconURL()` | `""` |
| `memberCount` | `guild.memberCount`, formatted | `"0"` |
| `channel` | `#${message.channel.name}` | `""` |
| `rank` | DB query: user position in guild leaderboard | `"?"` |
| `messages` | DB query: `reputation.messages_count` | `"0"` |
| `roleName` | resolved from roleId via guild.roles | `""` |
| `roleMention` | `<@&${roleId}>` if roleId provided | `""` |
| `voiceHours` | DB query: voice_stats if exists | `"0"` |
| `daysActive` | DB query: `user_stats.days_active` | `"0"` |
| `joinDate` | `member.joinedAt` formatted | `""` |

### Character Limit Validation

Separate utility function — enforcement at the action layer, not the template engine:

```js
/**
 * @param {string} text
 * @param {number} limit
 * @returns {{ valid: boolean, length: number, limit: number }}
 */
export function validateLength(text, limit)
```

### Performance

- `rank` query result is cached within a single pipeline execution (context is built once and shared across all actions in one level-up).
- DB queries for `messages`, `voiceHours`, `daysActive` are batched into a single query where possible.

## Component 3: Role Actions

**Files:**
- `src/modules/actions/grantRole.js`
- `src/modules/actions/removeRole.js`
- `src/modules/actions/roleUtils.js`

### grantRole Handler

```js
/**
 * @param {Object} action - { type: "grantRole", roleId: string }
 * @param {PipelineContext} context
 */
```

1. Run permission checks (from roleUtils).
2. Check rate limit (from roleUtils).
3. If `stackRoles: false`: remove all other XP-managed roles from member, then add the new one.
4. If `stackRoles: true`: just add the role.
5. Update template context with `roleName` and `roleId` for downstream actions.

### removeRole Handler

```js
/**
 * @param {Object} action - { type: "removeRole", roleId: string }
 * @param {PipelineContext} context
 */
```

1. Run permission checks.
2. Check rate limit.
3. Remove the role from the member.

### Permission Checks (roleUtils)

Before any role change:

1. **Bot has `MANAGE_ROLES`** — check `guild.members.me.permissions.has('ManageRoles')`.
2. **Role below bot's highest** — compare `role.position` vs `guild.members.me.roles.highest.position`.
3. On failure: log warning with guild ID, role ID, and reason. Skip silently (return, don't throw).

### Rate Limiter (roleUtils)

- In-memory `Map<string, number[]>`: key is `${guildId}:${userId}`, value is array of timestamps.
- Max 2 role changes per user per 60s sliding window.
- On each check: prune timestamps older than 60s, then check length.
- When rate limited: log warning, skip the action.
- Periodic sweep (every 5 min) evicts stale entries — same pattern as `reputation.js` cooldowns.
- Exported for testability: `checkRoleRateLimit()`, `sweepRoleLimits()`.

### Stack vs Replace

- `stackRoles: true` (default): add/remove only the specified role.
- `stackRoles: false`: on `grantRole`, compute the set of all XP-managed role IDs (from scanning all `levelActions` entries), remove all XP-managed roles the member currently has except the new one, then add the new one.
- The XP-managed role set is computed once per pipeline execution and passed via context.

### Remove-on-Level-Down

Separate from the pipeline — fires when XP is manually reduced:

```js
/**
 * Remove roles granted at levels above the new level.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {number} newLevel
 * @param {Object} xpConfig
 */
export async function enforceRoleLevelDown(member, newLevel, xpConfig)
```

Scans `levelActions` for `grantRole` actions at levels > `newLevel`, removes those roles. Respects rate limiting and permission checks.

## Changes to Existing Files

### `src/modules/reputation.js`

- Remove lines 124–210 (inline role assignment + announcement embed).
- Replace with:
  ```js
  if (newLevel > currentLevel) {
    await pool.query('UPDATE reputation SET level = $1 WHERE guild_id = $2 AND user_id = $3', [
      newLevel, message.guild.id, message.author.id,
    ]);
    const xpConfig = getXpConfig(message.guild.id);
    if (xpConfig.enabled) {
      executeLevelUpPipeline({
        member: message.member,
        message,
        guild: message.guild,
        previousLevel: currentLevel,
        newLevel,
        xp: newXp,
        config: xpConfig,
      }).catch(() => {}); // fire-and-forget, errors logged internally
    }
  }
  ```
- `computeLevel()` now reads thresholds from `config.xp.levelThresholds` instead of `config.reputation.levelThresholds`.
- Remove imports: `EmbedBuilder`, `safeSend`, `sanitizeMentions`.

### `src/modules/reputationDefaults.js`

Remove `roleRewards`, `announceChannelId`, `levelThresholds`. Result:

```js
export const REPUTATION_DEFAULTS = {
  enabled: false,
  xpPerMessage: [5, 15],
  xpCooldownSeconds: 60,
};
```

### `config.json`

- Remove from `reputation`: `announceChannelId`, `levelThresholds`, `roleRewards`.
- Add new top-level `xp` section with defaults.

### `src/api/utils/configAllowlist.js`

Add `'xp'` to `SAFE_CONFIG_KEYS`.

### `src/commands/rank.js` and `src/commands/leaderboard.js`

Update to read `levelThresholds` from `config.xp` instead of `config.reputation`.

## Testing Strategy

### Pipeline Engine Tests
- Actions resolve correctly for exact level match.
- Default actions fire when no level-specific entry exists.
- Level skip: 4→12 fires actions for 5, 10, 12.
- Per-action error isolation: one failing action doesn't block others.
- Empty config (no actions, no defaults) is a no-op.
- Pipeline disabled (`xp.enabled: false`) is a no-op.

### Template Engine Tests
- All 20 variables render correctly with sample data.
- Missing/null values render as empty string (or type-specific fallback).
- Unknown `{{tokens}}` left as-is.
- Nested/adjacent variables: `{{mention}} reached {{level}}`.
- Empty template returns empty string.
- `validateLength()` with under/over/exact limit.

### Role Action Tests
- grantRole adds role to member.
- removeRole removes role from member.
- Permission check: missing MANAGE_ROLES → skip with warning.
- Permission check: role above bot's highest → skip with warning.
- Rate limit: 3rd role change within 60s → skip with warning.
- Stack mode: `stackRoles: false` removes other XP-managed roles.
- Replace mode: only highest earned role is kept.
- `enforceRoleLevelDown`: removes roles above new level.
- Rate limiter sweep clears stale entries.

## Out of Scope (Phase 2+)

- Action types: sendDm, announce, addReaction, xpBonus, nickPrefix, webhook (#368, #369)
- WYSIWYG Discord markdown editor (#370)
- Visual embed builder (#371)
- Dashboard configuration page (#372)
