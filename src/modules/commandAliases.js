/**
 * Command Aliases Module
 *
 * Allows guild admins to create custom aliases for bot commands.
 * e.g. /w → /warn, /b → /ban
 *
 * Aliases are stored in PostgreSQL and registered as guild-specific Discord
 * slash commands so they appear in the command picker. The alias interaction
 * is then resolved to the target command and executed transparently.
 */

import { REST, Routes } from 'discord.js';
import { info, error as logError, warn } from '../logger.js';

/** In-memory cache: Map<guildId, Map<alias, targetCommand>> */
const aliasCache = new Map();

/** Discord REST client (lazy-initialised) */
let rest = null;

/**
 * Lazily initialise the Discord REST client.
 * @returns {REST}
 */
function getRest() {
  if (!rest) {
    const token = process.env.DISCORD_TOKEN;
    if (!token) throw new Error('DISCORD_TOKEN not set — cannot manage guild commands');
    rest = new REST({ version: '10' }).setToken(token);
  }
  return rest;
}

// ── Cache helpers ────────────────────────────────────────────────────────────

/**
 * Update the in-memory cache for a single alias entry.
 * @param {string} guildId
 * @param {string} alias
 * @param {string|null} targetCommand - null removes the entry
 */
function updateCache(guildId, alias, targetCommand) {
  if (!aliasCache.has(guildId)) {
    aliasCache.set(guildId, new Map());
  }
  const guildAliases = aliasCache.get(guildId);
  if (targetCommand === null) {
    guildAliases.delete(alias);
  } else {
    guildAliases.set(alias, targetCommand);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Load all aliases from the database into the in-memory cache.
 * Called once on startup.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<void>}
 */
export async function loadAliasesFromDb(pool) {
  try {
    const result = await pool.query(
      'SELECT guild_id, alias, target_command FROM guild_command_aliases ORDER BY guild_id, alias',
    );

    aliasCache.clear();
    for (const row of result.rows) {
      updateCache(row.guild_id, row.alias, row.target_command);
    }

    info('Command aliases loaded', { count: result.rows.length });
  } catch (err) {
    // Table may not exist if migrations haven't run — degrade gracefully
    warn('Failed to load command aliases (table may not exist yet)', { error: err.message });
  }
}

/**
 * Resolve a command name to its target command for a guild.
 * Returns the target command name if the input is an alias, or null.
 *
 * @param {string} guildId
 * @param {string} commandName
 * @returns {string|null}
 */
export function resolveAlias(guildId, commandName) {
  return aliasCache.get(guildId)?.get(commandName) ?? null;
}

/**
 * List all aliases for a guild.
 * @param {string} guildId
 * @returns {Array<{alias: string, targetCommand: string}>}
 */
export function listAliases(guildId) {
  const guildAliases = aliasCache.get(guildId);
  if (!guildAliases) return [];
  return Array.from(guildAliases.entries()).map(([alias, targetCommand]) => ({
    alias,
    targetCommand,
  }));
}

/**
 * Add a command alias for a guild.
 * Registers the alias as a guild-specific Discord slash command so it
 * appears in the command picker, then persists to the database.
 *
 * @param {object} options
 * @param {import('pg').Pool} options.pool
 * @param {string} options.guildId
 * @param {string} options.alias - The alias name (e.g. "w")
 * @param {string} options.targetCommand - The real command name (e.g. "warn")
 * @param {string} options.createdBy - Discord user ID of the admin creating the alias
 * @param {string} options.clientId - Discord application client ID
 * @param {object} options.targetCommandData - The target command's SlashCommandBuilder data (for cloning options)
 * @returns {Promise<{alias: string, targetCommand: string}>}
 */
export async function addAlias({
  pool,
  guildId,
  alias,
  targetCommand,
  createdBy,
  clientId,
  targetCommandData,
}) {
  // Build a guild command payload mirroring the target but with the alias name.
  // The description includes a clear indicator this is an alias.
  const targetJson = targetCommandData.toJSON();
  const aliasPayload = {
    ...targetJson,
    name: alias,
    description: `Alias for /${targetCommand}: ${targetJson.description}`,
  };

  // Register with Discord
  let discordCommandId = null;
  try {
    const registeredCmd = await getRest().post(Routes.applicationGuildCommands(clientId, guildId), {
      body: aliasPayload,
    });
    discordCommandId = registeredCmd.id;
    info('Alias registered as guild command', { alias, targetCommand, guildId, discordCommandId });
  } catch (err) {
    logError('Failed to register alias with Discord', {
      alias,
      targetCommand,
      guildId,
      error: err.message,
    });
    throw new Error(`Failed to register alias with Discord: ${err.message}`);
  }

  // Persist to DB + update cache. If either fails, roll back the Discord
  // guild command we just registered so we don't leave an orphaned command.
  try {
    await pool.query(
      `INSERT INTO guild_command_aliases (guild_id, alias, target_command, discord_command_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (guild_id, alias) DO UPDATE
         SET target_command = EXCLUDED.target_command,
             discord_command_id = EXCLUDED.discord_command_id,
             created_by = EXCLUDED.created_by,
             created_at = NOW()`,
      [guildId, alias, targetCommand, discordCommandId, createdBy],
    );

    updateCache(guildId, alias, targetCommand);
  } catch (dbErr) {
    // Best-effort rollback: deregister the Discord command we just created
    if (discordCommandId) {
      try {
        await getRest().delete(Routes.applicationGuildCommand(clientId, guildId, discordCommandId));
        warn('Rolled back Discord alias registration after DB failure', {
          alias,
          guildId,
          discordCommandId,
        });
      } catch (rollbackErr) {
        logError('Failed to roll back Discord alias registration', {
          alias,
          guildId,
          discordCommandId,
          error: rollbackErr.message,
        });
      }
    }
    throw dbErr;
  }

  return { alias, targetCommand };
}

/**
 * Remove a command alias for a guild.
 * Deregisters the guild-specific slash command from Discord and removes
 * the alias from the database.
 *
 * @param {object} options
 * @param {import('pg').Pool} options.pool
 * @param {string} options.guildId
 * @param {string} options.alias
 * @param {string} options.clientId - Discord application client ID
 * @returns {Promise<void>}
 */
export async function removeAlias({ pool, guildId, alias, clientId }) {
  // Fetch discord_command_id from DB
  const result = await pool.query(
    'SELECT discord_command_id FROM guild_command_aliases WHERE guild_id = $1 AND alias = $2',
    [guildId, alias],
  );

  if (result.rows.length === 0) {
    throw new Error(`Alias "/${alias}" not found for this server.`);
  }

  const { discord_command_id: discordCommandId } = result.rows[0];

  // Delete from Discord
  if (discordCommandId) {
    try {
      await getRest().delete(Routes.applicationGuildCommand(clientId, guildId, discordCommandId));
      info('Alias deregistered from Discord', { alias, guildId, discordCommandId });
    } catch (err) {
      // Non-fatal: command may already be gone. Log and continue cleanup.
      warn('Failed to deregister alias from Discord (continuing DB removal)', {
        alias,
        guildId,
        discordCommandId,
        error: err.message,
      });
    }
  }

  // Remove from DB
  await pool.query('DELETE FROM guild_command_aliases WHERE guild_id = $1 AND alias = $2', [
    guildId,
    alias,
  ]);

  // Update cache
  updateCache(guildId, alias, null);

  info('Alias removed', { alias, guildId });
}

// ── Test helpers (not part of public API) ────────────────────────────────────

/**
 * Reset internal state for testing.
 * @internal
 */
export function _resetForTesting() {
  aliasCache.clear();
  rest = null;
}
