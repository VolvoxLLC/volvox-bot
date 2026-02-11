/**
 * Configuration Module
 * Loads config from PostgreSQL with config.json as the seed/fallback
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from '../db.js';
import { info, error as logError, warn as logWarn } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', '..', 'config.json');

/** @type {Object} In-memory config cache */
let configCache = {};

/** @type {Object|null} Cached config.json contents (loaded once, never invalidated) */
let fileConfigCache = null;

/**
 * Load config.json from disk (used as seed/fallback)
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
 * @returns {Promise<Object>} Configuration object
 */
export async function loadConfig() {
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
      configCache = structuredClone(fileConfig);
      return configCache;
    }

    // Check if config table has any rows
    const { rows } = await pool.query('SELECT key, value FROM config');

    if (rows.length === 0) {
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
            'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
            [key, JSON.stringify(value)],
          );
        }
        await client.query('COMMIT');
        info('Config seeded to database');
        configCache = structuredClone(fileConfig);
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
      // Load from database
      configCache = {};
      for (const row of rows) {
        configCache[row.key] = row.value;
      }
      info('Config loaded from database');
    }
  } catch (err) {
    if (!fileConfig) {
      // No fallback available — re-throw
      throw err;
    }
    logError('Failed to load config from database, using config.json', { error: err.message });
    configCache = structuredClone(fileConfig);
  }

  return configCache;
}

/**
 * Get the current config (from cache)
 * @returns {Object} Configuration object
 */
export function getConfig() {
  return configCache;
}

/**
 * Set a config value using dot notation (e.g., "ai.model" or "welcome.enabled")
 * Persists to database and updates in-memory cache
 * @param {string} path - Dot-notation path (e.g., "ai.model")
 * @param {*} value - Value to set (automatically parsed from string)
 * @returns {Promise<Object>} Updated section config
 */
export async function setConfigValue(path, value) {
  const parts = path.split('.');
  if (parts.length < 2) {
    throw new Error('Path must include section and key (e.g., "ai.model")');
  }

  // Reject dangerous keys to prevent prototype pollution
  validatePathSegments(parts);

  const section = parts[0];
  const nestedParts = parts.slice(1);
  const parsedVal = parseValue(value);

  // Deep clone the section for the INSERT case (new section that doesn't exist yet)
  const sectionClone = structuredClone(configCache[section] || {});
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
      const { rows } = await client.query('SELECT value FROM config WHERE key = $1 FOR UPDATE', [
        section,
      ]);

      if (rows.length > 0) {
        // Row exists — merge change into the live DB value
        const dbSection = rows[0].value;
        setNestedValue(dbSection, nestedParts, parsedVal);

        await client.query('UPDATE config SET value = $1, updated_at = NOW() WHERE key = $2', [
          JSON.stringify(dbSection),
          section,
        ]);
      } else {
        // New section — use ON CONFLICT to handle concurrent inserts safely
        await client.query(
          'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
          [section, JSON.stringify(sectionClone)],
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

  // Update in-memory cache (mutate in-place for reference propagation)
  if (
    !configCache[section] ||
    typeof configCache[section] !== 'object' ||
    Array.isArray(configCache[section])
  ) {
    configCache[section] = {};
  }
  setNestedValue(configCache[section], nestedParts, parsedVal);

  info('Config updated', { path, value: parsedVal, persisted: dbPersisted });
  return configCache[section];
}

/**
 * Reset a config section to config.json defaults
 * @param {string} [section] - Section to reset, or all if omitted
 * @returns {Promise<Object>} Reset config
 */
export async function resetConfig(section) {
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

  if (section) {
    if (!fileConfig[section]) {
      throw new Error(`Section '${section}' not found in config.json defaults`);
    }

    if (pool) {
      try {
        await pool.query(
          'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
          [section, JSON.stringify(fileConfig[section])],
        );
      } catch (err) {
        logError('Database error during section reset — updating in-memory only', {
          section,
          error: err.message,
        });
      }
    }

    // Mutate in-place so references stay valid (deep clone to avoid shared refs)
    const sectionData = configCache[section];
    if (sectionData && typeof sectionData === 'object' && !Array.isArray(sectionData)) {
      for (const key of Object.keys(sectionData)) delete sectionData[key];
      Object.assign(sectionData, structuredClone(fileConfig[section]));
    } else {
      configCache[section] = isPlainObject(fileConfig[section])
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
            'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
            [key, JSON.stringify(value)],
          );
        }
        // Remove stale keys that exist in DB but not in config.json
        const fileKeys = Object.keys(fileConfig);
        if (fileKeys.length > 0) {
          await client.query('DELETE FROM config WHERE key != ALL($1::text[])', [fileKeys]);
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
    for (const key of Object.keys(configCache)) {
      if (!(key in fileConfig)) {
        delete configCache[key];
      }
    }
    for (const [key, value] of Object.entries(fileConfig)) {
      if (configCache[key] && isPlainObject(configCache[key]) && isPlainObject(value)) {
        for (const k of Object.keys(configCache[key])) delete configCache[key][k];
        Object.assign(configCache[key], structuredClone(value));
      } else {
        configCache[key] = isPlainObject(value) ? structuredClone(value) : value;
      }
    }
    info('All config reset to defaults');
  }

  return configCache;
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
