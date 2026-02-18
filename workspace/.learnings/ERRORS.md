# Errors Log

---

## [ERR-20260215-001] openclaw-hooks-enable-before-install

**Logged**: 2026-02-15T23:00:00-05:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
Ran `openclaw hooks enable self-improvement` before installing the hook, resulting in "Hook not found" error.

### Error
```
Error: Hook "self-improvement" not found
```

### Context
- Attempted to enable a hook from the `self-improving-agent` skill
- The hook files existed at `skills/self-improving-agent/hooks/openclaw/` but weren't registered with the gateway
- `openclaw hooks enable` only works for already-installed hooks
- `openclaw hooks list` confirmed only 4 bundled hooks were registered

### Suggested Fix
Always install hooks before enabling them:
```bash
# 1. Install (or link) first
openclaw hooks install --link /path/to/hook

# 2. Then enable (if not auto-enabled)
openclaw hooks enable hook-name

# 3. Restart gateway to load
```

### Resolution
- **Resolved**: 2026-02-15T23:00:00-05:00
- **Fix**: Used `openclaw hooks install --link` to register the hook directory, then restarted the gateway. Hook auto-enabled on install.
- **Notes**: `--link` is preferred for skills in the workspace so updates stay in sync.

### Metadata
- Source: error
- Reproducible: yes
- Related Files: skills/self-improving-agent/hooks/openclaw/
- Tags: openclaw, hooks, config, cli-ordering

---
