/**
 * Opt-Out Module
 * Manages user opt-out state for memory collection.
 *
 * Users who opt out will not have their messages analyzed for memory
 * extraction and will not have memories injected into AI context.
 * The bot still works normally for opted-out users, just without
 * long-term memory features.
 *
 * State is stored in an in-memory Set for fast lookups and persisted
 * to data/optout.json for durability across restarts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { info, warn as logWarn } from '../logger.js';

/** Default path for the opt-out persistence file */
const DEFAULT_OPTOUT_PATH = resolve('data/optout.json');

/** In-memory set of opted-out user IDs */
let optedOutUsers = new Set();

/** Current file path (can be overridden for testing) */
let optoutFilePath = DEFAULT_OPTOUT_PATH;

/**
 * Set the file path for opt-out persistence (for testing).
 * @param {string} filePath
 */
export function _setOptoutPath(filePath) {
  optoutFilePath = filePath;
}

/**
 * Reset the opt-out state (for testing).
 */
export function _resetOptouts() {
  optedOutUsers = new Set();
  optoutFilePath = DEFAULT_OPTOUT_PATH;
}

/**
 * Check if a user has opted out of memory collection.
 * @param {string} userId - Discord user ID
 * @returns {boolean} true if the user has opted out
 */
export function isOptedOut(userId) {
  return optedOutUsers.has(userId);
}

/**
 * Toggle the opt-out state for a user.
 * If opted out, opts them back in. If opted in, opts them out.
 * Persists the change to disk.
 * @param {string} userId - Discord user ID
 * @returns {{ optedOut: boolean }} The new opt-out state
 */
export function toggleOptOut(userId) {
  if (optedOutUsers.has(userId)) {
    optedOutUsers.delete(userId);
    info('User opted back in to memory', { userId });
    saveOptOuts();
    return { optedOut: false };
  }

  optedOutUsers.add(userId);
  info('User opted out of memory', { userId });
  saveOptOuts();
  return { optedOut: true };
}

/**
 * Load opt-out state from the persistence file.
 * Handles missing or corrupt files gracefully.
 */
export function loadOptOuts() {
  try {
    if (!existsSync(optoutFilePath)) {
      info('No opt-out file found, starting with empty set', { path: optoutFilePath });
      return;
    }

    const raw = readFileSync(optoutFilePath, 'utf-8');
    const data = JSON.parse(raw);

    if (Array.isArray(data)) {
      optedOutUsers = new Set(data);
      info('Loaded opt-out list', { count: optedOutUsers.size, path: optoutFilePath });
    } else {
      logWarn('Invalid opt-out file format, expected array', { path: optoutFilePath });
      optedOutUsers = new Set();
    }
  } catch (err) {
    logWarn('Failed to load opt-out file', { path: optoutFilePath, error: err.message });
    optedOutUsers = new Set();
  }
}

/**
 * Save the current opt-out state to the persistence file.
 */
export function saveOptOuts() {
  try {
    const dir = dirname(optoutFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data = JSON.stringify([...optedOutUsers], null, 2);
    writeFileSync(optoutFilePath, data, 'utf-8');
  } catch (err) {
    logWarn('Failed to save opt-out file', { path: optoutFilePath, error: err.message });
  }
}
