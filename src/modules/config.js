/**
 * Configuration Module
 * Loads config from PostgreSQL with config.json as the seed/fallback
 * Supports per-guild config overrides merged onto global defaults
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { getPool } from '../db.js';
import { info, error as logError, warn as logWarn } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', '..', 'config.json');

/** Maximum number of guild entries (excluding 'global') kept in configCache */
const MAX_GUILD_CACHE_SIZE = 500;

/** @type {Array<{path: string, callback: Function}>} Registered change listeners */
const listeners = [];

/**
 * Authoritative per-guild/global overrides loaded from the database.
 * Intentionally unbounded: entries here are source-of-truth snapshots that are
 * not cheap to rebuild without re-querying PostgreSQL.
 * Hot-path memory/performance pressure is handled separately by mergedConfigCache,
 * which stores computed global+guild views with LRU eviction.
 *
 * Expected upper bound: bounded by the number of guilds that have customized
 * config via /config set or the PATCH API, which mirrors the distinct guild_id
 * rows in the database. Each entry is small (only the override keys, not full
 * config). For deployments with >1000 guilds with overrides, consider adding
 * a size warning log or lazy-loading from DB on cache miss.
 * @type {Map<string, Object>}
 */
let configCache = new Map();

/** @type {Map<string, {generation: number, data: Object}>} Cached merged (global + guild override) config per guild */
const mergedConfigCache = new Map();

/**
 * Monotonically increasing counter bumped every time global config changes
 * through setConfigValue, resetConfig, or loadConfig. Used to detect stale
 * merged cache entries — if a cached entry's generation doesn't match, it
 * is treated as a cache miss and rebuilt from the current global config.
 *
 * ⚠️ This does NOT detect in-place mutations to the live global config
 * reference returned by getConfig() (no args). Such mutations are DEPRECATED
 * and should use setConfigValue() instead, which properly increments this
 * counter and invalidates the merged cache.
 * @type {number}
 */
let globalConfigGeneration = 0;

/** @type {Object|null} Cached config.json contents (loaded once, never invalidated) */
let fileConfigCache = null;

/**
 * Deep merge guild overrides onto global defaults.
 * For each key, if both source and target have plain objects, merge recursively.
 * Otherwise the source (guild override) value wins.
 * @param {Object} target - Cloned global defaults (mutated in place)
 * @param {Object} source - Guild overrides
 * @returns {Object} The merged target
 */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (DANGEROUS_KEYS.has(key)) continue;

    if (isPlainObject(target[key]) && isPlainObject(source[key])) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = structuredClone(source[key]);
    }
  }
  return target;
}

/**
 * Load config.json from disk (used as seed/fallback).
 *
 * Security note: config.json integrity is a deployment concern — the file is
 * read-only at runtime and is not validated beyond JSON parsing. Deployers
 * must ensure the file is not writable by untrusted processes.
 *
 * @returns {Object} Configuration object from file
 * @throws {Error} If config.json is missing or unparseable
 */
export function loadConfigFromFile() {
  if (fileConfigCache) return fileConfigCache;

  if (!existsSync(configPath)) {
    const err = new Error('config.json not found!');
    err.code = 'CONFIG_NOT_FOUND';
    throw err;
  }
  try {
    fileConfigCache = JSON.parse(readFileSync(configPath, 'utf-8'));
    return fileConfigCache;
  } catch (err) {
    throw new Error(`Failed to load config.json: ${err.message}`);
  }
}

/**
 * Load config from PostgreSQL, seeding from config.json if empty
 * Falls back to config.json if database is unavailable
 * @returns {Promise<Object>} Global configuration object (for backward compat)
 */
export async function loadConfig() {
  // Clear stale merged cache — configCache is about to be rebuilt, so any
  // previously merged guild snapshots are invalid.
  mergedConfigCache.clear();
  globalConfigGeneration++;

  // Try loading config.json — DB may have valid config even if file is missing
  let fileConfig;
  try {
    fileConfig = loadConfigFromFile();
  } catch {
    fileConfig = null;
    info('config.json not available, will rely on database for configuration');
  }

  try {
    let pool;
    try {
      pool = getPool();
    } catch {
      // DB not initialized — file config is our only option
      if (!fileConfig) {
        throw new Error(
          'No configuration source available: config.json is missing and database is not initialized',
        );
      }
      info('Database not available, using config.json');
      configCache = new Map();
      configCache.set('global', structuredClone(fileConfig));
      return configCache.get('global');
    }

    // NOTE: This fetches all config rows (all guilds) into memory at startup.
    // For large deployments with many guilds, consider lazy-loading guild configs
    // on first access or paginating this query. Currently acceptable for <1000 guilds.
    const { rows } = await pool.query('SELECT guild_id, key, value FROM config');

    // Separate global rows from guild-specific rows.
    // Treat rows with missing/undefined guild_id as 'global' (handles unmigrated DBs).
    const globalRows = rows.filter((r) => !r.guild_id || r.guild_id === 'global');
    const guildRows = rows.filter((r) => r.guild_id && r.guild_id !== 'global');

    if (globalRows.length === 0) {
      if (!fileConfig) {
        throw new Error(
          'No configuration source available: database is empty and config.json is missing',
        );
      }
      // Seed database from config.json inside a transaction
      info('No config in database, seeding from config.json');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [key, value] of Object.entries(fileConfig)) {
          await client.query(
            'INSERT INTO config (guild_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (guild_id, key) DO UPDATE SET value = $3, updated_at = NOW()',
            ['global', key, JSON.stringify(value)],
          );
        }
        await client.query('COMMIT');
        info('Config seeded to database');
        configCache = new Map();
        configCache.set('global', structuredClone(fileConfig));

        // Load any preexisting guild overrides that were already in the DB.
        // Without this, guild rows fetched above would be silently dropped.
        for (const row of guildRows) {
          if (DANGEROUS_KEYS.has(row.key)) {
            logWarn('Skipping dangerous config key from database', {
              key: row.key,
              guildId: row.guild_id,
            });
            continue;
          }

          if (!configCache.has(row.guild_id)) {
            configCache.set(row.guild_id, {});
          }
          configCache.get(row.guild_id)[row.key] = row.value;
        }
        if (guildRows.length > 0) {
          info('Loaded guild overrides during seed', {
            guildCount: new Set(guildRows.map((r) => r.guild_id)).size,
          });
        }
      } catch (txErr) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore rollback failure */
        }
        throw txErr;
      } finally {
        client.release();
      }
    } else {
      // Build config map from database rows
      configCache = new Map();

      // Build global config
      const globalConfig = {};
      for (const row of globalRows) {
        if (DANGEROUS_KEYS.has(row.key)) {
          logWarn('Skipping dangerous config key from database', {
            key: row.key,
            guildId: row.guild_id,
          });
          continue;
        }

        globalConfig[row.key] = row.value;
      }
      configCache.set('global', globalConfig);

      // Build per-guild configs (overrides only)
      for (const row of guildRows) {
        if (DANGEROUS_KEYS.has(row.key)) {
          logWarn('Skipping dangerous config key from database', {
            key: row.key,
            guildId: row.guild_id,
          });
          continue;
        }

        if (!configCache.has(row.guild_id)) {
          configCache.set(row.guild_id, {});
        }
        configCache.get(row.guild_id)[row.key] = row.value;
      }

      info('Config loaded from database', {
        globalKeys: globalRows.length,
        guildCount: new Set(guildRows.map((r) => r.guild_id)).size,
      });
    }
  } catch (err) {
    if (!fileConfig) {
      // No fallback available — re-throw
      throw err;
    }
    logError('Failed to load config from database, using config.json', { error: err.message });
    configCache = new Map();
    configCache.set('global', structuredClone(fileConfig));
  }

  return configCache.get('global');
}

/**
 * Get the current config (from cache).
 *
 * **Return semantics differ by path (intentional):**
 * - **Global path** (no guildId or guildId='global'): Returns a LIVE MUTABLE reference
 *   to the cached global config object. Mutations are visible to all subsequent callers.
 *   This is intentional for backward compatibility — existing code relies on mutating the
 *   returned object and having changes propagate.
 * - **Guild path** (guildId provided): Returns a deep-cloned merged copy of global defaults
 *   + guild overrides. Each call returns a fresh object; mutations do NOT affect the cache.
 *   This prevents cross-guild contamination.
 *
 * **⚠️ IMPORTANT: In-place mutation caveat:**
 * Direct mutation of the global config object (e.g. `getConfig().ai.model = "new"`) does
 * NOT invalidate `mergedConfigCache` or bump `globalConfigGeneration`. Guild-specific calls
 * to `getConfig(guildId)` may return stale merged data that still reflects the old global
 * defaults until the merged cache entry expires or is rebuilt. Use `setConfigValue()` for
 * proper cache invalidation. This asymmetry is intentional for backward compatibility with
 * legacy code that relies on mutating the returned global reference.
 *
 * @param {string} [guildId] - Guild ID, or omit / 'global' for global defaults
 * @returns {Object} Configuration object (live reference for global, cloned copy for guild)
 */
export function getConfig(guildId) {
  if (!guildId || guildId === 'global') {
    // ⚠️ Returns live cache reference — callers must NOT mutate the returned object
    return configCache.get('global') || {};
  }

  // Return clone from cached merged result if available and still valid.
  // Entries are stamped with the globalConfigGeneration at merge time —
  // if global config changed since then, the entry is stale and must be rebuilt.
  const cached = mergedConfigCache.get(guildId);
  if (cached && cached.generation === globalConfigGeneration) {
    // Refresh access order for LRU tracking (Maps preserve insertion order)
    mergedConfigCache.delete(guildId);
    mergedConfigCache.set(guildId, cached);
    // Guild path: returns deep clone to prevent cross-guild contamination (see JSDoc above)
    return structuredClone(cached.data);
  }

  const globalConfig = configCache.get('global') || {};
  const guildOverrides = configCache.get(guildId);

  if (!guildOverrides) {
    // Cache a reference to global defaults and return a detached clone.
    // This avoids an extra clone on cache-miss while preserving isolation for callers.
    cacheMergedResult(guildId, globalConfig);
    return structuredClone(globalConfig);
  }

  const merged = deepMerge(structuredClone(globalConfig), guildOverrides);
  cacheMergedResult(guildId, merged);
  return structuredClone(merged);
}

/**
 * Store a merged config result and enforce the LRU guild cache cap.
 * Evicts the least-recently-used guild entries when the cap is exceeded.
 * @param {string} guildId - Guild ID
 * @param {Object} merged - Merged config object
 */
function cacheMergedResult(guildId, merged) {
  mergedConfigCache.set(guildId, { generation: globalConfigGeneration, data: merged });

  // Evict least-recently-used guild entries when cap is exceeded
  if (mergedConfigCache.size > MAX_GUILD_CACHE_SIZE) {
    const firstKey = mergedConfigCache.keys().next().value;
    mergedConfigCache.delete(firstKey);
  }
}

/**
 * Traverse a nested object along dot-notation path segments and return the value.
 * Returns undefined if any intermediate key is missing.
 * @param {Object} obj - Object to traverse
 * @param {string[]} pathParts - Path segments
 * @returns {*} Value at the path, or undefined
 */
function getNestedValue(obj, pathParts) {
  let current = obj;
  for (const part of pathParts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Register a listener for config changes.
 * Use exact paths (e.g. "ai.model") or prefix wildcards (e.g. "ai.*").
 * @param {string} pathOrPrefix - Dot-notation path or prefix with wildcard
 * @param {Function} callback - Called with (newValue, oldValue, fullPath, guildId)
 */
export function onConfigChange(pathOrPrefix, callback) {
  listeners.push({ path: pathOrPrefix, callback });
}

/**
 * Remove a previously registered config change listener.
 * @param {string} pathOrPrefix - Same path used in onConfigChange
 * @param {Function} callback - Same callback reference used in onConfigChange
 */
export function offConfigChange(pathOrPrefix, callback) {
  const idx = listeners.findIndex((l) => l.path === pathOrPrefix && l.callback === callback);
  if (idx !== -1) listeners.splice(idx, 1);
}

/**
 * Remove all registered config change listeners.
 */
export function clearConfigListeners() {
  listeners.length = 0;
}

/**
 * Emit config change events to matching listeners.
 * Matches exact paths and prefix wildcards (e.g. "ai.*" matches "ai.model").
 * @param {string} fullPath - The full dot-notation path that changed
 * @param {*} newValue - The new value
 * @param {*} oldValue - The previous value
 * @param {string} guildId - The guild ID that changed ('global' for global)
 */
async function emitConfigChangeEvents(fullPath, newValue, oldValue, guildId) {
  for (const listener of [...listeners]) {
    const isExact = listener.path === fullPath;
    const isPrefix =
      !isExact &&
      listener.path.endsWith('.*') &&
      fullPath.startsWith(listener.path.replace(/\.\*$/, '.'));
    if (isExact || isPrefix) {
      try {
        const result = listener.callback(newValue, oldValue, fullPath, guildId);
        if (result && typeof result.then === 'function') {
          await result.catch((err) => {
            logWarn('Async config change listener error', {
              path: fullPath,
              error: String(err?.message || err),
            });
          });
        }
      } catch (err) {
        logError('Config change listener error', {
          path: fullPath,
          error: String(err?.message || err),
        });
      }
    }
  }
}

/**
 * Clone a value for safe event payload emission.
 * @param {*} value - Value to clone when object-like
 * @returns {*}
 */
function cloneForEvent(value) {
  return value !== null && typeof value === 'object' ? structuredClone(value) : value;
}

/**
 * Collect leaf values from an object into a dot-notation map.
 * Plain-object leaves are flattened; arrays and primitives are treated as terminal values.
 * @param {*} value - Root value
 * @param {string} prefix - Current dot-notation prefix
 * @param {Map<string, *>} out - Output map
 */
function collectLeafValues(value, prefix, out) {
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      collectLeafValues(value[key], path, out);
    }
    return;
  }

  if (prefix) {
    out.set(prefix, cloneForEvent(value));
  }
}

/**
 * Build path-level changed leaf events for a reset scope.
 * @param {Object} beforeConfig - Effective config before reset
 * @param {Object} afterConfig - Effective config after reset
 * @param {string|undefined} scopePath - Optional section path scope
 * @returns {Array<{path: string, newValue: *, oldValue: *}>}
 */
function getChangedLeafEvents(beforeConfig, afterConfig, scopePath) {
  const scopeParts = scopePath ? scopePath.split('.') : [];
  const beforeScoped = scopePath ? getNestedValue(beforeConfig, scopeParts) : beforeConfig;
  const afterScoped = scopePath ? getNestedValue(afterConfig, scopeParts) : afterConfig;

  const beforeLeaves = new Map();
  const afterLeaves = new Map();

  if (beforeScoped !== undefined) {
    collectLeafValues(beforeScoped, scopePath || '', beforeLeaves);
  }
  if (afterScoped !== undefined) {
    collectLeafValues(afterScoped, scopePath || '', afterLeaves);
  }

  const allPaths = new Set([...beforeLeaves.keys(), ...afterLeaves.keys()]);
  const changed = [];

  for (const path of allPaths) {
    const oldValue = beforeLeaves.has(path) ? beforeLeaves.get(path) : undefined;
    const newValue = afterLeaves.has(path) ? afterLeaves.get(path) : undefined;
    if (!isDeepStrictEqual(oldValue, newValue)) {
      changed.push({ path, newValue, oldValue });
    }
  }

  return changed;
}

/**
 * Set a config value using dot notation (e.g., "ai.model" or "welcome.enabled")
 * Persists to database and updates in-memory cache
 * @param {string} path - Dot-notation path (e.g., "ai.model")
 * @param {*} value - Value to set (automatically parsed from string)
 * @param {string} [guildId='global'] - Guild ID, or 'global' for global defaults
 * @returns {Promise<Object>} Updated section config
 */
export async function setConfigValue(path, value, guildId = 'global') {
  const parts = path.split('.');
  if (parts.length < 2) {
    throw new Error('Path must include section and key (e.g., "ai.model")');
  }

  // Reject dangerous keys to prevent prototype pollution
  validatePathSegments(parts);

  const section = parts[0];
  const nestedParts = parts.slice(1);
  const parsedVal = parseValue(value);

  // Get the current guild entry from cache (or empty object for new guild)
  const guildConfig = configCache.get(guildId) || {};

  // Deep clone the section for the INSERT case (new section that doesn't exist yet)
  const sectionClone = structuredClone(guildConfig[section] || {});
  setNestedValue(sectionClone, nestedParts, parsedVal);

  // Write to database first, then update cache.
  // Uses a transaction with row lock to prevent concurrent writes from clobbering.
  // Reads the current row, applies the change in JS (handles arbitrary nesting),
  // then writes back — safe because the row is locked for the duration.
  let dbPersisted = false;

  // Separate pool acquisition from transaction work so we can distinguish
  // "DB not configured" (graceful fallback) from real transaction errors (must surface).
  let pool;
  try {
    pool = getPool();
  } catch {
    // DB not initialized — skip persistence, fall through to in-memory update
    logWarn('Database not initialized for config write — updating in-memory only');
  }

  if (pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the row (or prepare for INSERT if missing)
      const { rows } = await client.query(
        'SELECT value FROM config WHERE guild_id = $1 AND key = $2 FOR UPDATE',
        [guildId, section],
      );

      if (rows.length > 0) {
        // Row exists — merge change into the live DB value
        const dbSection = rows[0].value;
        setNestedValue(dbSection, nestedParts, parsedVal);

        await client.query(
          'UPDATE config SET value = $1, updated_at = NOW() WHERE guild_id = $2 AND key = $3',
          [JSON.stringify(dbSection), guildId, section],
        );
      } else {
        // New section — use ON CONFLICT to handle concurrent inserts safely
        await client.query(
          'INSERT INTO config (guild_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (guild_id, key) DO UPDATE SET value = $3, updated_at = NOW()',
          [guildId, section, JSON.stringify(sectionClone)],
        );
      }
      await client.query('COMMIT');
      dbPersisted = true;
    } catch (txErr) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore rollback failure */
      }
      throw txErr;
    } finally {
      client.release();
    }
  }

  // Ensure guild entry exists in cache
  if (!configCache.has(guildId)) {
    configCache.set(guildId, {});
  }
  const cacheEntry = configCache.get(guildId);

  // Note: oldValue is captured from the guild's override cache, not the effective (merged) value.
  // This means listeners see the previous override value (or undefined if no prior override existed),
  // not the previous merged value that getConfig(guildId) would have returned.
  const rawOld = getNestedValue(cacheEntry[section], nestedParts);
  const oldValue = rawOld !== null && typeof rawOld === 'object' ? structuredClone(rawOld) : rawOld;

  // Update in-memory cache (mutate in-place for reference propagation)
  if (
    !cacheEntry[section] ||
    typeof cacheEntry[section] !== 'object' ||
    Array.isArray(cacheEntry[section])
  ) {
    cacheEntry[section] = {};
  }
  setNestedValue(cacheEntry[section], nestedParts, parsedVal);

  // Invalidate merged config cache for this guild (will be rebuilt on next getConfig)
  // When global config changes, ALL merged entries are stale (they depend on global)
  if (guildId === 'global') {
    mergedConfigCache.clear();
    globalConfigGeneration++;
  } else {
    mergedConfigCache.delete(guildId);
  }

  info('Config updated', { path, value: parsedVal, guildId, persisted: dbPersisted });
  await emitConfigChangeEvents(path, parsedVal, oldValue, guildId);
  return cacheEntry[section];
}

/**
 * Reset a config section to defaults.
 * For global: resets to config.json defaults.
 * For guild: deletes guild overrides (falls back to global).
 * @param {string} [section] - Section to reset, or all if omitted
 * @param {string} [guildId='global'] - Guild ID, or 'global' for global defaults
 * @returns {Promise<Object>} Reset config (global config object for global, or remaining guild overrides)
 */
export async function resetConfig(section, guildId = 'global') {
  // Guild reset — just delete overrides
  if (guildId !== 'global') {
    const beforeEffective = getConfig(guildId);

    let pool = null;
    try {
      pool = getPool();
    } catch {
      logWarn('Database unavailable for config reset — updating in-memory only');
    }

    if (pool) {
      try {
        if (section) {
          await pool.query('DELETE FROM config WHERE guild_id = $1 AND key = $2', [
            guildId,
            section,
          ]);
        } else {
          await pool.query('DELETE FROM config WHERE guild_id = $1', [guildId]);
        }
      } catch (err) {
        logError('Database error during guild config reset — updating in-memory only', {
          guildId,
          section,
          error: err.message,
        });
      }
    }

    const guildConfig = configCache.get(guildId);
    if (guildConfig) {
      if (section) {
        delete guildConfig[section];
      } else {
        configCache.delete(guildId);
      }
    }

    mergedConfigCache.delete(guildId);

    const afterEffective = getConfig(guildId);
    const changedEvents = getChangedLeafEvents(beforeEffective, afterEffective, section);
    for (const { path, newValue, oldValue } of changedEvents) {
      await emitConfigChangeEvents(path, newValue, oldValue, guildId);
    }

    info('Guild config reset', { guildId, section: section || 'all' });
    return section ? configCache.get(guildId) || {} : {};
  }

  // Global reset — same logic as before, resets to config.json defaults
  let fileConfig;
  try {
    fileConfig = loadConfigFromFile();
  } catch {
    throw new Error(
      'Cannot reset configuration: config.json is not available. ' +
        'Reset requires the default config file as a baseline.',
    );
  }

  let pool = null;
  try {
    pool = getPool();
  } catch {
    logWarn('Database unavailable for config reset — updating in-memory only');
  }

  const globalConfig = configCache.get('global') || {};
  const beforeGlobal = structuredClone(globalConfig);

  if (section) {
    if (!fileConfig[section]) {
      throw new Error(`Section '${section}' not found in config.json defaults`);
    }

    if (pool) {
      try {
        await pool.query(
          'INSERT INTO config (guild_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (guild_id, key) DO UPDATE SET value = $3, updated_at = NOW()',
          ['global', section, JSON.stringify(fileConfig[section])],
        );
      } catch (err) {
        logError('Database error during section reset — updating in-memory only', {
          section,
          error: err.message,
        });
      }
    }

    // Mutate in-place so references stay valid (deep clone to avoid shared refs)
    const sectionData = globalConfig[section];
    if (sectionData && typeof sectionData === 'object' && !Array.isArray(sectionData)) {
      for (const key of Object.keys(sectionData)) delete sectionData[key];
      Object.assign(sectionData, structuredClone(fileConfig[section]));
    } else {
      globalConfig[section] = isPlainObject(fileConfig[section])
        ? structuredClone(fileConfig[section])
        : fileConfig[section];
    }
    info('Config section reset', { section });
  } else {
    // Reset all inside a transaction
    if (pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [key, value] of Object.entries(fileConfig)) {
          await client.query(
            'INSERT INTO config (guild_id, key, value) VALUES ($1, $2, $3) ON CONFLICT (guild_id, key) DO UPDATE SET value = $3, updated_at = NOW()',
            ['global', key, JSON.stringify(value)],
          );
        }
        // Remove stale global keys that exist in DB but not in config.json
        const fileKeys = Object.keys(fileConfig);
        if (fileKeys.length > 0) {
          await client.query('DELETE FROM config WHERE guild_id = $1 AND key != ALL($2::text[])', [
            'global',
            fileKeys,
          ]);

          // Warn about orphaned per-guild rows that reference keys no longer in global defaults
          const orphanResult = await client.query(
            'SELECT DISTINCT guild_id, key FROM config WHERE guild_id != $1 AND key != ALL($2::text[])',
            ['global', fileKeys],
          );
          if (orphanResult.rows?.length > 0) {
            const orphanSummary = orphanResult.rows.map((r) => `${r.guild_id}:${r.key}`).join(', ');
            logWarn('Orphaned per-guild config rows reference keys no longer in global defaults', {
              orphanedEntries: orphanSummary,
              count: orphanResult.rows.length,
            });
          }
        }
        await client.query('COMMIT');
      } catch (txErr) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore rollback failure */
        }
        logError('Database error during full config reset — updating in-memory only', {
          error: txErr.message,
        });
      } finally {
        client.release();
      }
    }

    // Mutate in-place and remove stale keys from cache (deep clone to avoid shared refs)
    for (const key of Object.keys(globalConfig)) {
      if (!(key in fileConfig)) {
        delete globalConfig[key];
      }
    }
    for (const [key, value] of Object.entries(fileConfig)) {
      if (globalConfig[key] && isPlainObject(globalConfig[key]) && isPlainObject(value)) {
        for (const k of Object.keys(globalConfig[key])) delete globalConfig[key][k];
        Object.assign(globalConfig[key], structuredClone(value));
      } else {
        globalConfig[key] = isPlainObject(value) ? structuredClone(value) : value;
      }
    }
    info('All config reset to defaults');
  }

  // Global config changed — all guild merged entries are stale
  mergedConfigCache.clear();
  globalConfigGeneration++;

  const changedEvents = getChangedLeafEvents(beforeGlobal, globalConfig, section);
  for (const { path, newValue, oldValue } of changedEvents) {
    await emitConfigChangeEvents(path, newValue, oldValue, 'global');
  }

  return globalConfig;
}

/** Keys that must never be used as path segments (prototype pollution vectors) */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validate that no path segment is a prototype-pollution vector.
 * @param {string[]} segments - Path segments to check
 * @throws {Error} If any segment is a dangerous key
 */
function validatePathSegments(segments) {
  for (const segment of segments) {
    if (DANGEROUS_KEYS.has(segment)) {
      throw new Error(`Invalid config path: '${segment}' is a reserved key and cannot be used`);
    }
  }
}

/**
 * Traverse a nested object along dot-notation path segments, creating
 * intermediate objects as needed, and set the leaf value.
 * @param {Object} root - Object to traverse
 * @param {string[]} pathParts - Path segments (excluding the root key)
 * @param {*} value - Value to set at the leaf
 */
function setNestedValue(root, pathParts, value) {
  if (pathParts.length === 0) {
    throw new Error('setNestedValue requires at least one path segment');
  }
  let current = root;
  for (let i = 0; i < pathParts.length - 1; i++) {
    // Defensive: reject prototype-pollution keys even for internal callers
    if (DANGEROUS_KEYS.has(pathParts[i])) {
      throw new Error(`Invalid config path segment: '${pathParts[i]}' is a reserved key`);
    }
    if (current[pathParts[i]] == null || typeof current[pathParts[i]] !== 'object') {
      current[pathParts[i]] = {};
    } else if (Array.isArray(current[pathParts[i]])) {
      // Keep arrays intact when the next path segment is a valid numeric index;
      // otherwise replace with a plain object (legacy behaviour for non-numeric keys).
      if (!/^\d+$/.test(pathParts[i + 1])) {
        current[pathParts[i]] = {};
      }
    }
    current = current[pathParts[i]];
  }
  const leafKey = pathParts[pathParts.length - 1];
  if (DANGEROUS_KEYS.has(leafKey)) {
    throw new Error(`Invalid config path segment: '${leafKey}' is a reserved key`);
  }
  current[leafKey] = value;
}

/**
 * Check if a value is a plain object (not null, not array)
 * @param {*} val - Value to check
 * @returns {boolean} True if plain object
 */
function isPlainObject(val) {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Parse a string value into its appropriate JS type.
 *
 * Coercion rules:
 * - "true" / "false" → boolean
 * - "null" → null
 * - Numeric strings → number (unless beyond Number.MAX_SAFE_INTEGER)
 * - JSON arrays/objects → parsed value
 * - Everything else → kept as-is string
 *
 * To force a literal string (e.g. the word "true"), wrap it in JSON quotes:
 *   "\"true\"" → parsed by JSON.parse into the string "true"
 *
 * @param {string} value - String value to parse
 * @returns {*} Parsed value
 */
function parseValue(value) {
  if (typeof value !== 'string') return value;

  // Booleans
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Null
  if (value === 'null') return null;

  // Numbers (keep as string if beyond safe integer range to avoid precision loss)
  // Matches: 123, -123, 1.5, -1.5, 1., .5, -.5
  if (/^-?(\d+\.?\d*|\.\d+)$/.test(value)) {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    if (!value.includes('.') && !Number.isSafeInteger(num)) return value;
    return num;
  }

  // JSON strings (e.g. "\"true\"" → force literal string "true"), arrays, and objects
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('[') && value.endsWith(']')) ||
    (value.startsWith('{') && value.endsWith('}'))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // Plain string
  return value;
}
