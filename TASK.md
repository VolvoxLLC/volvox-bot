# TASK: Issue #133 — Config diff preview before saving

## Context
Branch: `feat/issue-133`, Repo: VolvoxLLC/volvox-bot
Work in: `/home/bill/worktrees/volvox-bot-133`

## Current state
- `web/src/components/dashboard/config-diff.tsx` — already exists, renders a diff inline below the form
- `web/src/components/dashboard/config-diff-modal.tsx` — already exists, shows a modal before save
- `web/src/components/dashboard/config-editor.tsx` — orchestrates save flow; `showDiffModal` state exists
- The `diff` package is already in `web/package.json`

## What still needs to be done

### 1. "Unsaved changes" indicator
- The Save button should show a visual badge/dot when draft differs from saved config
- Check `hasChanges` variable in config-editor.tsx — it likely already computes this
- Add a yellow dot indicator to the save button when `hasChanges` is true

### 2. Keyboard shortcut — Ctrl+S / Cmd+S to save
- Add `useEffect` with `keydown` listener in config-editor.tsx
- Ctrl+S (Windows) or Cmd+S (Mac) should trigger the save flow (with diff modal)
- Make sure it doesn't fire when user is typing in an input (check `event.target`)

### 3. Undo last save
- Store previous saved config in a ref or state: `lastSavedConfig`
- After a successful save, keep the previous version
- Show an "Undo last save" button after save completes (dismiss after 30s or next change)
- On undo: restore `lastSavedConfig` and save it immediately

### 4. Revert individual changes from diff view
- In `config-diff-modal.tsx` or `config-diff.tsx`, add a "Revert" button per changed field
- On revert: call `updateDraftConfig` to reset that specific path to the saved value

### 5. Check the full save flow works correctly
- Diff modal shows before save → user confirms → save happens
- Cancel from diff modal → no save

## Rules
- Commit each feature separately with conventional commits
- Run `pnpm --prefix web lint && pnpm --prefix web typecheck`
- Do NOT push

Closes #133
