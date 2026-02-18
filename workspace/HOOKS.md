# Loading Triggers

OpenClaw doesn't have a built-in trigger loader, but there are several ways to make this work:

## Option 1: AGENTS.md Instruction (Current)

The agent reads `AGENTS.md` on every session. Add command recognition there:

```markdown
## Commands

When you see these commands, execute immediately:
- `.usage` → Run usage scripts
- `.help` → Show all commands
- etc.
```

**Pros:** Simple, works immediately
**Cons:** Agent needs to be explicitly told about each command

## Option 2: Hook System

Create a Gateway hook that intercepts messages and checks triggers.json:

```bash
openclaw hooks create trigger-handler
```

The hook would:
1. Read `triggers.json` on startup
2. Intercept messages starting with `.`
3. Execute matching command
4. Replace message with result

**Pros:** Automatic, centralized
**Cons:** Requires hook development

## Option 3: Plugin

Create a plugin that registers triggers:

```typescript
export default {
  name: 'triggers',
  async onLoad(ctx) {
    const triggers = await loadTriggers();
    ctx.registerCommands(triggers);
  }
}
```

**Pros:** Most flexible, can hook into OpenClaw core
**Cons:** Most complex

## Recommended: Hybrid

1. Keep `triggers.json` as source of truth
2. Document commands in `AGENTS.md` (current solution)
3. Later: Build hook to auto-load from triggers.json

For now, the agent recognizes commands via AGENTS.md instructions.
