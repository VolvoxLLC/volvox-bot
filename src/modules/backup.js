/**
 * Backup Module
 * Handles server configuration export, import, scheduled backups, and backup history.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/129
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

// TODO: Consider switching to fs.promises for async operations to improve performance
// and avoid blocking the event loop with synchronous file system operations.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAFE_CONFIG_KEYS, SENSITIVE_FIELDS } from '../api/utils/configAllowlist.js';
import { info, error as logError, warn } from '../logger.js';
import { flattenToLeafPaths } from '../utils/flattenToLeafPaths.js';
import { getConfig, setConfigValue } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Default backup directory (data/backups relative to project root) */
const DEFAULT_BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'backups');

/** Backup file naming pattern */
const BACKUP_FILENAME_PATTERN = /^backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3})-\d{4}\.json$/;

/** Default retention: keep last 7 daily + 4 weekly backups */
const DEFAULT_RETENTION = { daily: 7, weekly: 4 };

/** Monotonic counter used to disambiguate same-millisecond backups */
let backupSeq = 0;

/** Interval handle for scheduled backups */
let scheduledBackupInterval = null;

/**
 * Get or create the backup directory.
 *
 * @param {string} [dir] - Override backup directory path
 * @returns {string} The backup directory path
 */
export function getBackupDir(dir) {
  const backupDir = dir ?? DEFAULT_BACKUP_DIR;
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
  return backupDir;
}

/**
 * Sanitize config by replacing sensitive field values with a redaction placeholder.
 * Exported configs can then be shared without leaking secrets.
 *
 * @param {Object} config - Config object to sanitize
 * @returns {Object} Sanitized deep-clone of config
 */
export function sanitizeConfig(config) {
  const sanitized = structuredClone(config);

  for (const dotPath of SENSITIVE_FIELDS) {
    const parts = dotPath.split('.');
    let obj = sanitized;
    for (let i = 0; i < parts.length - 1; i++) {
      if (obj == null || typeof obj !== 'object') break;
      obj = obj[parts[i]];
    }
    const lastKey = parts[parts.length - 1];
    if (obj != null && typeof obj === 'object' && lastKey in obj) {
      obj[lastKey] = '[REDACTED]';
    }
  }

  return sanitized;
}

/**
 * Export current configuration as a JSON-serialisable payload.
 * Only exports sections listed in SAFE_CONFIG_KEYS.
 * Sensitive fields are redacted.
 *
 * @returns {{config: Object, exportedAt: string, version: number}} Export payload
 */
export function exportConfig() {
  const config = getConfig();
  const exported = {};

  for (const key of SAFE_CONFIG_KEYS) {
    if (key in config) {
      exported[key] = config[key];
    }
  }

  return {
    config: sanitizeConfig(exported),
    exportedAt: new Date().toISOString(),
    version: 1,
  };
}

/**
 * Validate an import payload structure.
 *
 * @param {unknown} payload - Parsed JSON payload from an import file
 * @returns {string[]} Array of validation error messages (empty if valid)
 */
export function validateImportPayload(payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return ['Import payload must be a JSON object'];
  }

  if (!('config' in payload)) {
    return ['Import payload must have a "config" key'];
  }

  const { config } = payload;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return ['"config" must be a JSON object'];
  }

  const errors = [];
  for (const [key, value] of Object.entries(config)) {
    if (!SAFE_CONFIG_KEYS.has(key)) {
      errors.push(`"${key}" is not a writable config section`);
    } else if (typeof value !== 'object' || value === null) {
      errors.push(`"${key}" must be an object or array`);
    }
  }

  return errors;
}

/**
 * Import configuration from an export payload.
 * Applies all non-redacted values to the live config.
 *
 * @param {Object} payload - Export payload (must pass validateImportPayload)
 * @returns {Promise<{applied: string[], skipped: string[], failed: Array<{path: string, error: string}>}>}
 */
export async function importConfig(payload) {
  const { config } = payload;

  const applied = [];
  const skipped = [];
  const failed = [];

  for (const [section, sectionValue] of Object.entries(config)) {
    if (!SAFE_CONFIG_KEYS.has(section)) continue;

    const paths = flattenToLeafPaths(sectionValue, section);
    for (const [dotPath, value] of paths) {
      // Skip redacted placeholders — don't overwrite real secrets with placeholder text
      if (value === '[REDACTED]') {
        skipped.push(dotPath);
        continue;
      }

      try {
        await setConfigValue(dotPath, value);
        applied.push(dotPath);
      } catch (err) {
        failed.push({ path: dotPath, error: err.message });
      }
    }
  }

  return { applied, skipped, failed };
}

/**
 * Generate a backup filename for the given date.
 *
 * @param {Date} [date] - Date to use (defaults to now)
 * @returns {string} Filename like "backup-2026-03-01T12-00-00-000-0000.json" (includes milliseconds and sequence suffix)
 */
function makeBackupFilename(date = new Date()) {
  // Include milliseconds for precision; append an incrementing sequence to guarantee uniqueness
  // within the same millisecond (e.g. rapid test runs or burst backup triggers).
  const iso = date.toISOString().replace(/:/g, '-').replace(/Z$/, '').replace(/\./, '-');
  const seq = String(backupSeq++).padStart(4, '0');
  return `backup-${iso}-${seq}.json`;
}

/**
 * Create a timestamped backup of the current config in the backup directory.
 *
 * @param {string} [backupDir] - Override backup directory
 * @returns {{id: string, path: string, size: number, createdAt: string}} Backup metadata
 */
export function createBackup(backupDir) {
  const dir = getBackupDir(backupDir);
  const now = new Date();
  const filename = makeBackupFilename(now);
  const filePath = path.join(dir, filename);

  const payload = exportConfig();
  const json = JSON.stringify(payload, null, 2);

  writeFileSync(filePath, json, 'utf8');

  const { size } = statSync(filePath);
  const id = filename.replace('.json', '');

  info('Config backup created', { id, path: filePath, size });

  return {
    id,
    path: filePath,
    size,
    createdAt: now.toISOString(),
  };
}

/**
 * Parse backup metadata from a filename and stat the file.
 *
 * @param {string} filename - Backup filename
 * @param {string} dir - Directory containing the backup file
 * @returns {{id: string, filename: string, createdAt: string, size: number} | null}
 */
function parseBackupMeta(filename, dir) {
  const match = BACKUP_FILENAME_PATTERN.exec(filename);
  if (!match) return null;

  const filePath = path.join(dir, filename);
  let size = 0;
  try {
    size = statSync(filePath).size;
  } catch {
    return null;
  }

  // Convert "2026-03-01T12-00-00-000" → "2026-03-01T12:00:00.000Z"
  const isoStr = match[1].replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})$/, 'T$1:$2:$3.$4Z');

  return {
    id: filename.replace('.json', ''),
    filename,
    createdAt: isoStr,
    size,
  };
}

/**
 * List all available backups, sorted newest first.
 *
 * @param {string} [backupDir] - Override backup directory
 * @returns {Array<{id: string, filename: string, createdAt: string, size: number}>}
 */
export function listBackups(backupDir) {
  const dir = getBackupDir(backupDir);

  let files;
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }

  const backups = files
    .map((filename) => parseBackupMeta(filename, dir))
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return backups;
}

/**
 * Read and parse a backup file by ID.
 *
 * @param {string} id - Backup ID (filename without .json)
 * @param {string} [backupDir] - Override backup directory
 * @returns {Object} Parsed backup payload
 * @throws {Error} If backup file not found or invalid
 */
export function readBackup(id, backupDir) {
  // Validate ID against strict pattern: backup-YYYY-MM-DDTHH-mm-ss-SSS-NNNN
  const BACKUP_ID_PATTERN =
    /^backup-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}-[0-9]{4}$/;
  if (!BACKUP_ID_PATTERN.test(id)) {
    throw new Error('Invalid backup ID');
  }

  const dir = getBackupDir(backupDir);
  const filename = `${id}.json`;
  const filePath = path.join(dir, filename);

  if (!existsSync(filePath)) {
    throw new Error(`Backup not found: ${id}`);
  }

  const raw = readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Backup file is corrupted: ${id}`);
  }
}

/**
 * Restore configuration from a backup.
 *
 * @param {string} id - Backup ID to restore from
 * @param {string} [backupDir] - Override backup directory
 * @returns {Promise<{applied: string[], skipped: string[], failed: Array<{path: string, error: string}>}>}
 * @throws {Error} If backup not found or invalid
 */
export async function restoreBackup(id, backupDir) {
  const payload = readBackup(id, backupDir);

  const validationErrors = validateImportPayload(payload);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid backup format: ${validationErrors.join(', ')}`);
  }

  info('Restoring config from backup', { id });
  const result = await importConfig(payload);
  info('Config restored from backup', {
    id,
    applied: result.applied.length,
    failed: result.failed.length,
  });

  return result;
}

/**
 * Prune old backups according to retention policy.
 * Always keeps the `daily` most recent backups.
 * Additionally keeps one backup per week for the last `weekly` weeks.
 *
 * @param {{daily?: number, weekly?: number}} [retention] - Retention counts
 * @param {string} [backupDir] - Override backup directory
 * @returns {string[]} IDs of deleted backups
 */
export function pruneBackups(retention, backupDir) {
  const { daily = DEFAULT_RETENTION.daily, weekly = DEFAULT_RETENTION.weekly } = retention ?? {};
  const dir = getBackupDir(backupDir);
  const all = listBackups(dir);

  if (all.length === 0) return [];

  // Always keep the `daily` most recent backups
  const toKeep = new Set(all.slice(0, daily).map((b) => b.id));

  // Keep one representative backup per week for `weekly` weeks
  const now = new Date();
  for (let week = 0; week < weekly; week++) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (week + 1) * 7);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - week * 7);

    const weekBackup = all.find((b) => {
      const ts = new Date(b.createdAt);
      return ts >= weekStart && ts < weekEnd;
    });

    if (weekBackup) {
      toKeep.add(weekBackup.id);
    }
  }

  const deleted = [];
  for (const backup of all) {
    if (!toKeep.has(backup.id)) {
      try {
        unlinkSync(path.join(dir, backup.filename));
        deleted.push(backup.id);
        info('Pruned old backup', { id: backup.id });
      } catch (err) {
        logError('Failed to prune backup', { id: backup.id, error: err.message });
      }
    }
  }

  return deleted;
}

/**
 * Start the scheduled backup job.
 * Creates a backup at the given interval (default: every 24 hours)
 * and prunes old backups after each run.
 *
 * @param {{intervalMs?: number, retention?: {daily?: number, weekly?: number}, backupDir?: string}} [opts]
 * @returns {void}
 */
export function startScheduledBackups(opts = {}) {
  const {
    intervalMs = 24 * 60 * 60 * 1000, // 24 hours
    retention,
    backupDir,
  } = opts;

  if (scheduledBackupInterval) {
    warn('Scheduled backups already running — skipping duplicate start');
    return;
  }

  info('Starting scheduled config backups', { intervalMs });

  scheduledBackupInterval = setInterval(() => {
    try {
      createBackup(backupDir);
      pruneBackups(retention, backupDir);
    } catch (err) {
      logError('Scheduled backup failed', { error: err.message });
    }
  }, intervalMs);

  // Prevent the interval from keeping the process alive unnecessarily (e.g. in tests)
  if (typeof scheduledBackupInterval.unref === 'function') {
    scheduledBackupInterval.unref();
  }
}

/**
 * Stop the scheduled backup job.
 *
 * @returns {void}
 */
export function stopScheduledBackups() {
  if (scheduledBackupInterval) {
    clearInterval(scheduledBackupInterval);
    scheduledBackupInterval = null;
    info('Stopped scheduled config backups');
  }
}
