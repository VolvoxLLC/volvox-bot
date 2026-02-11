/**
 * Configuration Module
 * Loads config from PostgreSQL with config.json as the seed/fallback
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../db.js';
import { info, error as logError } from '../logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, '..', '..', 'config.json');

/** @type {Object} In-memory config cache */
let configCache = {};

/**
 * Load config.json from disk (used as seed/fallback)
 * @returns {Object} Configuration object from file
 * @throws {Error} If config.json is missing or unparseable
 */
export function loadConfigFromFile() {
  if (!existsSync(configPath)) {
    const err = new Error('config.json not found!');
    err.code = 'CONFIG_NOT_FOUND';
    throw err;
  }
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
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
  // Try loading config.json but don't hard-exit — DB may have valid config
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
        throw new Error('No configuration source available: config.json is missing and database is not initialized');
      }
      info('Database not available, using config.json');
      configCache = { ...fileConfig };
      return configCache;
    }

    // Check if config table has any rows
    const { rows } = await pool.query('SELECT key, value FROM config');

    if (rows.length === 0) {
      if (!fileConfig) {
        throw new Error('No configuration source available: database is empty and config.json is missing');
      }
      // Seed database from config.json inside a transaction
      info('No config in database, seeding from config.json');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const [key, value] of Object.entries(fileConfig)) {
          await client.query(
            'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
            [key, JSON.stringify(value)]
          );
        }
        await client.query('COMMIT');
        info('Config seeded to database');
        configCache = { ...fileConfig };
      } catch (txErr) {
        try { await client.query('ROLLBACK'); } catch { /* ignore rollback failure */ }
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
    configCache = { ...fileConfig };
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

  const section = parts[0];
  const finalKey = parts[parts.length - 1];
  const parsedVal = parseValue(value);

  // Deep clone the section for the INSERT case (new section that doesn't exist yet)
  const sectionClone = structuredClone(configCache[section] || {});
  let current = sectionClone;
  for (let i = 1; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[finalKey] = parsedVal;

  // Write to database first, then update cache.
  // Uses a transaction with row lock to prevent concurrent writes from clobbering.
  // Reads the current row, applies the change in JS (handles arbitrary nesting),
  // then writes back — safe because the row is locked for the duration.
  let dbPersisted = false;
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the row (or prepare for INSERT if missing)
      const { rows } = await client.query(
        'SELECT value FROM config WHERE key = $1 FOR UPDATE',
        [section]
      );

      if (rows.length > 0) {
        // Row exists — merge change into the live DB value
        const dbSection = rows[0].value;
        let node = dbSection;
        for (let i = 1; i < parts.length - 1; i++) {
          if (node[parts[i]] === undefined || typeof node[parts[i]] !== 'object') {
            node[parts[i]] = {};
          }
          node = node[parts[i]];
        }
        node[finalKey] = parsedVal;

        await client.query(
          'UPDATE config SET value = $1, updated_at = NOW() WHERE key = $2',
          [JSON.stringify(dbSection), section]
        );
      } else {
        // New section — insert the full clone
        await client.query(
          'INSERT INTO config (key, value) VALUES ($1, $2)',
          [section, JSON.stringify(sectionClone)]
        );
      }
      await client.query('COMMIT');
      dbPersisted = true;
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (err) {
    logError('Database unavailable for config write — updating in-memory only', { error: err.message });
  }

  // Update in-memory cache (mutate in-place for reference propagation)
  if (!configCache[section] || typeof configCache[section] !== 'object') {
    configCache[section] = {};
  }
  let target = configCache[section];
  for (let i = 1; i < parts.length - 1; i++) {
    if (target[parts[i]] === undefined || typeof target[parts[i]] !== 'object') {
      target[parts[i]] = {};
    }
    target = target[parts[i]];
  }
  target[finalKey] = parsedVal;

  info('Config updated', { path, value: parsedVal, persisted: dbPersisted });
  return configCache[section];
}

/**
 * Reset a config section to config.json defaults
 * @param {string} [section] - Section to reset, or all if omitted
 * @returns {Promise<Object>} Reset config
 */
export async function resetConfig(section) {
  const fileConfig = loadConfigFromFile();

  let pool = null;
  try {
    pool = getPool();
  } catch {
    logError('Database unavailable for config reset — updating in-memory only');
  }

  if (section) {
    if (!fileConfig[section]) {
      throw new Error(`Section '${section}' not found in config.json defaults`);
    }

    if (pool) {
      await pool.query(
        'INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()',
        [section, JSON.stringify(fileConfig[section])]
      );
    }

    // Mutate in-place so references stay valid
    const sectionData = configCache[section];
    if (sectionData && typeof sectionData === 'object') {
      for (const key of Object.keys(sectionData)) delete sectionData[key];
      Object.assign(sectionData, fileConfig[section]);
    } else {
      configCache[section] = isPlainObject(fileConfig[section])
        ? { ...fileConfig[section] }
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
            [key, JSON.stringify(value)]
          );
        }
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    }

    // Mutate in-place
    for (const [key, value] of Object.entries(fileConfig)) {
      if (configCache[key] && isPlainObject(configCache[key]) && isPlainObject(value)) {
        for (const k of Object.keys(configCache[key])) delete configCache[key][k];
        Object.assign(configCache[key], value);
      } else {
        configCache[key] = isPlainObject(value) ? { ...value } : value;
      }
    }
    info('All config reset to defaults');
  }

  return configCache;
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
 * Parse a string value into its appropriate JS type
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
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    if (!value.includes('.') && !Number.isSafeInteger(num)) return value;
    return num;
  }

  // JSON arrays/objects
  if ((value.startsWith('[') && value.endsWith(']')) || (value.startsWith('{') && value.endsWith('}'))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // Plain string
  return value;
}
