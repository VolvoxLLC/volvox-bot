# TASK: Fix 10 remaining PR #248 review threads

Branch: `refactor/triage-prompt-rewrite`
Work in: `/home/bill/worktrees/volvox-bot-248`

## Fixes

### 1. EngagementSection.tsx — stable badge keys
- File: `web/src/components/dashboard/config-sections/EngagementSection.tsx` line 53
- Currently uses index-based key `badge-row-${i}`. When badges are reordered or deleted, React reuses wrong DOM nodes.
- Fix: give each badge a stable `id` (e.g. `badge.id ?? badge.name ?? index`) as the key

### 2. AiAutoModSection.tsx — clamp threshold before converting
- File: `web/src/components/dashboard/config-sections/AiAutoModSection.tsx` line 99
- `150` or `-5` gets saved as `1.5`/`-0.05` without clamping
- Fix: clamp parsed value to [0, 100] before `percentToDecimal()`:
  ```tsx
  const clamped = Math.min(100, Math.max(0, parsed));
  onThresholdChange(percentToDecimal(clamped));
  ```

### 3. ChallengesSection.tsx — single quotes in JSX strings
- File: `web/src/components/dashboard/config-sections/ChallengesSection.tsx` line 84
- JSX string literals use double quotes; repo convention is single quotes
- Fix: change double-quoted JSX string attributes to single quotes where applicable (biome can auto-fix this)

### 4. ChallengesSection.tsx — validate IANA timezone
- File: `web/src/components/dashboard/config-sections/ChallengesSection.tsx` line 84
- Timezone is still free-text; typos silently break scheduling
- Fix: Use `Intl.supportedValuesOf('timeZone')` to validate, or add a `<datalist>` with common timezones, and show an error if the entered value isn't a valid IANA zone:
  ```tsx
  const isValidTimezone = (tz: string) => {
    try { Intl.DateTimeFormat(undefined, { timeZone: tz }); return true; }
    catch { return false; }
  };
  ```
  Show a red error message below the input if invalid.

### 5. GitHubSection.tsx — sync pollIntervalMinutes with draft state
- File: `web/src/components/dashboard/config-sections/GitHubSection.tsx` line 63
- When `pollIntervalMinutes` is unset, renders `5` but never writes it to draftConfig
- Fix: use `value={draftConfig.github?.pollIntervalMinutes ?? 5}` AND write back on change (including the default 5):
  ```tsx
  onChange={(e) => {
    const val = Math.max(1, parseInt(e.target.value, 10) || 5);
    onFieldChange('pollIntervalMinutes', val);
  }}
  ```

### 6. ModerationSection.tsx — mobile-responsive rate-limit grids
- File: `web/src/components/dashboard/config-sections/ModerationSection.tsx` line 229
- Fix `grid-cols-2` and `grid-cols-3` → `grid-cols-1 sm:grid-cols-2` and `grid-cols-1 sm:grid-cols-3`

### 7. StarboardSection.tsx — use `''` not `null` for cleared channelId
- File: `web/src/components/dashboard/config-sections/StarboardSection.tsx` line 57
- `StarboardConfig.channelId` is `string`, not `string | null`
- Fix: `onChange={(val) => onFieldChange('channelId', val ?? '')}` instead of `val ?? null`

### 8. StarboardSection.tsx — ignoredChannels updates on change not just blur
- File: `web/src/components/dashboard/config-sections/StarboardSection.tsx` line 133
- Save can fire while input has focus; latest value missed if user saves before blur
- Fix: update `draftConfig` on `onChange` too (keep raw state for display but also flush to draft):
  ```tsx
  onChange={(e) => {
    setIgnoredChannelsRaw(e.target.value);
    // also flush to draft so Ctrl+S captures current value
    const parsed = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    onIgnoredChannelsChange(parsed);
  }}
  ```

### 9. TriageSection.tsx — mobile-responsive numeric grids
- File: `web/src/components/dashboard/config-sections/TriageSection.tsx` line 182
- Same as ModerationSection — `grid-cols-2` → `grid-cols-1 sm:grid-cols-2`

### 10. config-updates.ts — fix updateArrayItem early return
- File: `web/src/lib/config-updates.ts` line 137
- Early return on missing array breaks the empty-array initialization case
- Check existing tests in `web/tests/lib/config-updates.test.ts` to understand the expected behavior
- Fix: instead of returning `prev` when the array is missing, initialize it as `[]` and proceed with the update

## Rules
- Commit each logical group (backend fixes together, frontend sections together, lib fixes together)
- Run `pnpm format && pnpm lint` and `pnpm --prefix web lint && pnpm --prefix web typecheck`
- Do NOT push
