# Task: Backend — Per-Channel AI Response Mode

## Parent
- **Master Task:** task-003
- **Branch:** feat/channel-modes
- **Issue:** #264

## Context
Add per-channel AI response mode support (off / mention / vibe). Currently the bot only responds on @mention/reply. We need a config-driven mode system where admins can set each channel to `off`, `mention` (default), or `vibe`.

**IMPORTANT:** Commit after EVERY meaningful file change. Don't batch everything at the end.
**Expected duration:** ~20 minutes.

## Current Code
- `src/modules/ai.js` — has `isChannelBlocked()` for blocklist, conversation history management
- `src/modules/events/messageCreate.js` — the main message handler, currently checks `isMentioned`, `isReply`, `allowedChannels`, `blockedChannelIds`
- `src/api/routes/guilds.js` — `getGuildChannels()` returns `{ id, name, type }` (needs `parentId`, `position` for dashboard)
- `config.json` — `ai` section already in `SAFE_CONFIG_KEYS`

## Config Schema
```json
{
  "ai": {
    "channelModes": {
      "123456789": "off",
      "987654321": "vibe"
    },
    "defaultChannelMode": "mention"
  }
}
```
Channels absent from `channelModes` inherit `defaultChannelMode`. Default is `"mention"`.

## Files to Change

### 1. `src/modules/ai.js` — Add `getChannelMode()`
```js
/**
 * Resolve the effective AI response mode for a channel.
 * Priority: blockedChannelIds → channelModes map → defaultChannelMode → 'mention'
 *
 * For threads, check parentId against the modes map (inherit parent's mode).
 *
 * @param {string} channelId
 * @param {string|null} parentId - For threads, the parent channel ID
 * @param {string} guildId
 * @returns {'off'|'mention'|'vibe'}
 */
export function getChannelMode(channelId, parentId = null, guildId) {
  const config = getConfig(guildId);
  // Hard block from blockedChannelIds takes precedence
  const blocked = config?.ai?.blockedChannelIds;
  if (Array.isArray(blocked) && blocked.length > 0) {
    if (blocked.includes(channelId)) return 'off';
    if (parentId && blocked.includes(parentId)) return 'off';
  }
  
  const modes = config?.ai?.channelModes;
  const defaultMode = config?.ai?.defaultChannelMode ?? 'mention';
  
  if (modes && typeof modes === 'object') {
    // Direct channel match
    if (modes[channelId]) return modes[channelId];
    // Thread inherits parent mode
    if (parentId && modes[parentId]) return modes[parentId];
  }
  
  return defaultMode;
}
```

### 2. `src/modules/events/messageCreate.js` — Use mode-based routing

Replace the current mention + allowedChannels + blockedChannelIds logic with mode-based routing:

```
const parentId = message.channel.isThread?.() ? message.channel.parentId : null;
const mode = getChannelMode(message.channel.id, parentId, message.guild.id);

if (mode === 'off') return; // Skip AI entirely

if (mode === 'mention') {
  // Only respond on @mention or reply (current behavior)
  if (isMentioned || isReply) {
    // ... existing evaluateNow logic
  }
} else if (mode === 'vibe') {
  if (isMentioned || isReply) {
    // Direct mention in vibe mode → immediate evaluation
    // ... existing evaluateNow logic
  }
  // In vibe mode, ALL messages get accumulated for triage
  // The accumulate at the bottom of the handler already does this
}
```

**Key behavior:**
- `off` → No AI at all (no accumulate, no evaluate)
- `mention` → Only respond to @mentions/replies (current default)
- `vibe` → Accumulate all messages for triage evaluation; @mentions still get instant response

**Important:** Keep the existing `allowedChannels` whitelist logic for backward compat. Channel modes layer on top — if `allowedChannels` is set and the channel isn't in it, respect that even in `vibe` mode.

**Import `getChannelMode` from `../ai.js`** at the top of the file.

### 3. `src/api/routes/guilds.js` — Enhance `getGuildChannels()`

Add `parentId` and `position` to the channel objects:
```js
channels.push({ 
  id: ch.id, 
  name: ch.name, 
  type: ch.type,
  parentId: ch.parentId ?? null,
  position: ch.position ?? 0
});
```

### 4. Tests — `tests/modules/channelMode.test.js` (NEW)

Write comprehensive unit tests for `getChannelMode()`:
- Default mode is 'mention' when no config
- Respects `defaultChannelMode` config
- Respects per-channel `channelModes` override
- Thread inherits parent channel mode
- `blockedChannelIds` overrides channelModes (returns 'off')
- Invalid/unknown mode values handled gracefully
- Empty channelModes map falls through to default

Also update existing event handler tests if they break due to the routing changes.

## Requirements
- [ ] `getChannelMode()` exported from `src/modules/ai.js`
- [ ] `messageCreate.js` uses mode-based routing
- [ ] `getGuildChannels()` includes `parentId` and `position`
- [ ] Unit tests for mode resolution
- [ ] All existing tests still pass (`pnpm test`)
- [ ] Lint passes (`pnpm lint`)

## Constraints
- Do NOT touch any `web/` files — those are assigned to another subagent
- Do NOT modify `src/api/utils/configAllowlist.js` — `ai` is already in SAFE_CONFIG_KEYS
- Keep backward compat with existing `allowedChannels` and `blockedChannelIds`
- Use Winston logger (never `console.*`)
- ESM, semicolons, single quotes, 2-space indent (Biome enforced)

## Commit Flow
1. First commit: `getChannelMode()` in ai.js
2. Second commit: messageCreate.js routing changes
3. Third commit: guilds.js channel API enhancement
4. Fourth commit: unit tests
5. Final commit: any fixes from test/lint run

## Acceptance Criteria
- [ ] Tests pass (`pnpm test`)
- [ ] Lint passes (`pnpm lint`)
- [ ] All committed locally
- [ ] Report `git diff --stat` output

## Results
_[Fill in when done]_
