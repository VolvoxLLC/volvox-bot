# `/reload` Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a bot-owner-only `/reload` slash command that reloads config, commands, triage, and opt-outs without a full restart.

**Architecture:** Single command file (`src/commands/reload.js`) that sequentially calls existing module functions (`loadConfig`, `loadCommandsFromDirectory`, `registerCommands`, `stopTriage`/`startTriage`, `loadOptOuts`). Each step is wrapped in try/catch so failures are isolated. Results are displayed in an embed.

**Tech Stack:** discord.js v14 SlashCommandBuilder, ESM dynamic `import()` with cache-busting, existing bot module APIs.

---

### Task 1: Export `isBotOwner` from permissions.js

**Files:**
- Modify: `src/utils/permissions.js:36` (change `function` to `export function`)
- Test: `tests/utils/permissions.test.js`

**Step 1: Write the failing test**

Add to the end of `tests/utils/permissions.test.js`:

```js
describe('isBotOwner', () => {
  it('should return true for a bot owner', () => {
    const config = { permissions: { botOwners: ['123'] } };
    const member = { id: '123' };
    expect(isBotOwner(member, config)).toBe(true);
  });

  it('should return false for a non-owner', () => {
    const config = { permissions: { botOwners: ['123'] } };
    const member = { id: '456' };
    expect(isBotOwner(member, config)).toBe(false);
  });

  it('should return false when botOwners is empty', () => {
    const config = { permissions: { botOwners: [] } };
    const member = { id: '123' };
    expect(isBotOwner(member, config)).toBe(false);
  });
});
```

Also update the import at the top of the test file to include `isBotOwner`:

```js
import { getBotOwnerIds, getPermissionError, hasPermission, isAdmin, isBotOwner, isGuildAdmin, isModerator } from '../../src/utils/permissions.js';
```

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/utils/permissions.test.js`
Expected: FAIL — `isBotOwner` is not exported.

**Step 3: Export `isBotOwner`**

In `src/utils/permissions.js:36`, change:

```js
function isBotOwner(member, config) {
```

to:

```js
export function isBotOwner(member, config) {
```

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/utils/permissions.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/permissions.js tests/utils/permissions.test.js
git commit -m "refactor(permissions): export isBotOwner for reuse"
```

---

### Task 2: Create the reload command

**Files:**
- Create: `src/commands/reload.js`

**Step 1: Write the command file**

Create `src/commands/reload.js`:

```js
/**
 * Reload Command
 * Reloads bot config, commands, triage, and opt-outs without a full restart.
 * Restricted to bot owners.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { info, error as logError, warn } from '../logger.js';
import { getConfig, loadConfig } from '../modules/config.js';
import { loadOptOuts } from '../modules/optout.js';
import { startTriage, stopTriage } from '../modules/triage.js';
import { HealthMonitor } from '../utils/health.js';
import { loadCommandsFromDirectory } from '../utils/loadCommands.js';
import { isBotOwner } from '../utils/permissions.js';
import { registerCommands } from '../utils/registerCommands.js';
import { safeEditReply, safeReply } from '../utils/safeSend.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const data = new SlashCommandBuilder()
  .setName('reload')
  .setDescription('Reload bot config, commands, and services (Bot owner only)');

export const adminOnly = true;

/**
 * Execute the reload command.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  const config = getConfig(interaction.guildId);

  // Bot owner gate — stricter than adminOnly
  if (!isBotOwner(interaction.member, config)) {
    return await safeReply(interaction, {
      content: '❌ This command is restricted to bot owners.',
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  const startTime = Date.now();
  const results = [];

  // Step 1: Reload config from database
  try {
    await loadConfig();
    results.push({ name: 'Config', success: true });
    info('Reload: config reloaded', { userId: interaction.user.id });
  } catch (err) {
    results.push({ name: 'Config', success: false, error: err.message });
    logError('Reload: config reload failed', { error: err.message });
  }

  // Step 2: Reload commands with cache-busting
  try {
    const commandsPath = join(__dirname, '.');
    interaction.client.commands.clear();

    await loadCommandsFromDirectory({
      commandsPath,
      onCommandLoaded: (command) => {
        interaction.client.commands.set(command.data.name, command);
      },
      logLoaded: false,
    });
    results.push({ name: 'Commands', success: true, detail: `${interaction.client.commands.size} loaded` });
    info('Reload: commands reloaded', { count: interaction.client.commands.size, userId: interaction.user.id });
  } catch (err) {
    results.push({ name: 'Commands', success: false, error: err.message });
    logError('Reload: command reload failed', { error: err.message });
  }

  // Step 3: Re-register slash commands with Discord
  try {
    const commands = Array.from(interaction.client.commands.values());
    const guildId = process.env.GUILD_ID || null;
    await registerCommands(commands, interaction.client.user.id, process.env.DISCORD_TOKEN, guildId);
    results.push({ name: 'Register', success: true });
    info('Reload: commands registered with Discord', { userId: interaction.user.id });
  } catch (err) {
    results.push({ name: 'Register', success: false, error: err.message });
    logError('Reload: command registration failed', { error: err.message });
  }

  // Step 4: Restart triage
  try {
    stopTriage();
    const freshConfig = getConfig();
    const healthMonitor = HealthMonitor.getInstance();
    await startTriage(interaction.client, freshConfig, healthMonitor);
    results.push({ name: 'Triage', success: true });
    info('Reload: triage restarted', { userId: interaction.user.id });
  } catch (err) {
    results.push({ name: 'Triage', success: false, error: err.message });
    logError('Reload: triage restart failed', { error: err.message });
  }

  // Step 5: Reload opt-outs
  try {
    await loadOptOuts();
    results.push({ name: 'Opt-outs', success: true });
    info('Reload: opt-outs reloaded', { userId: interaction.user.id });
  } catch (err) {
    results.push({ name: 'Opt-outs', success: false, error: err.message });
    logError('Reload: opt-out reload failed', { error: err.message });
  }

  // Build result embed
  const allSuccess = results.every((r) => r.success);
  const elapsed = Date.now() - startTime;

  const description = results
    .map((r) => {
      const icon = r.success ? '✅' : '❌';
      const detail = r.detail ? ` (${r.detail})` : '';
      const errMsg = r.error ? ` — ${r.error}` : '';
      return `${icon} **${r.name}**${detail}${errMsg}`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle('🔄 Bot Reload')
    .setColor(allSuccess ? 0x57f287 : 0xfee75c)
    .setDescription(description)
    .setFooter({ text: `Completed in ${elapsed}ms` })
    .setTimestamp();

  await safeEditReply(interaction, { embeds: [embed] });
}
```

**Step 2: Verify the file loads**

Run: `node -e "import('./src/commands/reload.js').then(m => console.log(m.data.name))"`
Expected: `reload`

**Step 3: Commit**

```bash
git add src/commands/reload.js
git commit -m "feat(commands): add /reload command for bot owners"
```

---

### Task 3: Write tests for the reload command

**Files:**
- Create: `tests/commands/reload.test.js`

**Step 1: Write the test file**

Create `tests/commands/reload.test.js`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock logger
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
}));

// Mock dependencies
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    permissions: { botOwners: ['owner-123'] },
  }),
  loadConfig: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../src/modules/optout.js', () => ({
  loadOptOuts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/triage.js', () => ({
  startTriage: vi.fn().mockResolvedValue(undefined),
  stopTriage: vi.fn(),
}));

vi.mock('../../src/utils/health.js', () => ({
  HealthMonitor: {
    getInstance: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('../../src/utils/loadCommands.js', () => ({
  loadCommandsFromDirectory: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/utils/permissions.js', () => ({
  isBotOwner: vi.fn().mockReturnValue(true),
}));

vi.mock('../../src/utils/registerCommands.js', () => ({
  registerCommands: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/utils/safeSend.js', () => ({
  safeReply: vi.fn().mockResolvedValue(undefined),
  safeEditReply: vi.fn().mockResolvedValue(undefined),
}));

import { getConfig, loadConfig } from '../../src/modules/config.js';
import { loadOptOuts } from '../../src/modules/optout.js';
import { startTriage, stopTriage } from '../../src/modules/triage.js';
import { loadCommandsFromDirectory } from '../../src/utils/loadCommands.js';
import { isBotOwner } from '../../src/utils/permissions.js';
import { registerCommands } from '../../src/utils/registerCommands.js';
import { safeEditReply, safeReply } from '../../src/utils/safeSend.js';

import { adminOnly, data, execute } from '../../src/commands/reload.js';

/** Build a mock interaction for testing */
function mockInteraction(overrides = {}) {
  return {
    member: { id: 'owner-123' },
    user: { id: 'owner-123', tag: 'owner#0001' },
    guildId: 'guild-1',
    deferReply: vi.fn().mockResolvedValue(undefined),
    client: {
      commands: new Map(),
      user: { id: 'bot-123' },
    },
    ...overrides,
  };
}

describe('reload command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with name "reload"', () => {
    expect(data.name).toBe('reload');
  });

  it('should export adminOnly = true', () => {
    expect(adminOnly).toBe(true);
  });

  it('should reject non-bot-owners', async () => {
    isBotOwner.mockReturnValueOnce(false);
    const interaction = mockInteraction();

    await execute(interaction);

    expect(safeReply).toHaveBeenCalledWith(interaction, expect.objectContaining({
      content: expect.stringContaining('bot owners'),
      ephemeral: true,
    }));
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it('should reload all subsystems successfully', async () => {
    const interaction = mockInteraction();

    await execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
    expect(loadConfig).toHaveBeenCalled();
    expect(loadCommandsFromDirectory).toHaveBeenCalled();
    expect(registerCommands).toHaveBeenCalled();
    expect(stopTriage).toHaveBeenCalled();
    expect(startTriage).toHaveBeenCalled();
    expect(loadOptOuts).toHaveBeenCalled();

    // Check embed was sent with green color (all success)
    expect(safeEditReply).toHaveBeenCalledWith(interaction, expect.objectContaining({
      embeds: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            color: 0x57f287,
          }),
        }),
      ]),
    }));
  });

  it('should continue and show yellow embed when a step fails', async () => {
    loadConfig.mockRejectedValueOnce(new Error('DB connection failed'));
    const interaction = mockInteraction();

    await execute(interaction);

    // Other steps should still run
    expect(loadCommandsFromDirectory).toHaveBeenCalled();
    expect(stopTriage).toHaveBeenCalled();
    expect(loadOptOuts).toHaveBeenCalled();

    // Should show yellow color (partial failure)
    expect(safeEditReply).toHaveBeenCalledWith(interaction, expect.objectContaining({
      embeds: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            color: 0xfee75c,
          }),
        }),
      ]),
    }));
  });

  it('should show error details in embed description', async () => {
    loadConfig.mockRejectedValueOnce(new Error('DB timeout'));
    const interaction = mockInteraction();

    await execute(interaction);

    const embedArg = safeEditReply.mock.calls[0][1];
    const embed = embedArg.embeds[0];
    expect(embed.data.description).toContain('DB timeout');
    expect(embed.data.description).toContain('Config');
  });

  it('should clear and rebuild client.commands', async () => {
    const commands = new Map([['old', {}]]);
    const interaction = mockInteraction({ client: { commands, user: { id: 'bot-123' } } });

    await execute(interaction);

    expect(loadCommandsFromDirectory).toHaveBeenCalledWith(expect.objectContaining({
      logLoaded: false,
    }));
  });
});
```

**Step 2: Run tests**

Run: `pnpm test tests/commands/reload.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add tests/commands/reload.test.js
git commit -m "test(reload): add unit tests for reload command"
```

---

### Task 4: Add reload to config.json permissions

**Files:**
- Modify: `config.json:168` (add `"reload": "admin"` to `allowedCommands`)

**Step 1: Add the permission entry**

In `config.json`, inside `permissions.allowedCommands`, add after the last entry (`"showcase": "everyone"`):

```json
"reload": "admin"
```

Note: We set it to `"admin"` here because the `adminOnly` export and explicit `isBotOwner()` check inside the command provide the real restriction. The config entry just prevents "command not in config" from defaulting to admin-only silently.

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('config.json', 'utf8')); console.log('valid')"`
Expected: `valid`

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (the generic `tests/commands.test.js` validates all command files).

**Step 4: Commit**

```bash
git add config.json
git commit -m "chore(config): add reload command to allowedCommands"
```

---

### Task 5: Update documentation

**Files:**
- Modify: `AGENTS.md` (Key Files table, around line 67)

**Step 1: Add reload to Key Files table**

Add a row to the Key Files table in `AGENTS.md`:

```markdown
| `src/commands/reload.js` | Reload command — `/reload` reloads config, commands, triage, and opt-outs (bot owner only) |
```

**Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add reload command to AGENTS.md key files table"
```

---

### Task 6: Integration verification

**Step 1: Run full test suite with coverage**

Run: `pnpm test:coverage`
Expected: All tests pass, coverage stays above 80%.

**Step 2: Run linter**

Run: `pnpm run lint` (or Biome check)
Expected: No lint errors.

**Step 3: Verify command loads at startup**

Run: `node -e "import('./src/commands/reload.js').then(m => { console.log('name:', m.data.name); console.log('adminOnly:', m.adminOnly); console.log('execute:', typeof m.execute); })"`
Expected:
```
name: reload
adminOnly: true
execute: function
```
