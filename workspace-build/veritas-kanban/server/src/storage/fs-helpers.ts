/**
 * Centralized filesystem primitives.
 *
 * ALL direct imports from the Node.js `fs` module live here (or in other
 * `storage/` files). Service and route code that needs low-level fs access
 * imports from this module instead of `'fs'` directly.
 *
 * NOTE: We use default imports from `node:fs` to avoid brittle named-import
 * interop when Vite/Vitest processes CJS builtins.
 */

import fs from 'node:fs';
import type { FSWatcher } from 'node:fs';
import { access } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// Synchronous helpers (used by security config, agent status persistence)
// ---------------------------------------------------------------------------

export const existsSync = fs.existsSync;
export const readFileSync = fs.readFileSync;
export const writeFileSync = fs.writeFileSync;
export const mkdirSync = fs.mkdirSync;
export const renameSync = fs.renameSync;

// ---------------------------------------------------------------------------
// Watcher primitives (used by task-service, config-service cache invalidation)
// ---------------------------------------------------------------------------

export const watch = fs.watch;
export type { FSWatcher };

// ---------------------------------------------------------------------------
// Stream creators (used by telemetry compression / decompression)
// ---------------------------------------------------------------------------

export const createReadStream = fs.createReadStream;
export const createWriteStream = fs.createWriteStream;

// ---------------------------------------------------------------------------
// Async helpers
// ---------------------------------------------------------------------------

/**
 * Async file-existence check.
 *
 * Drop-in replacement for `existsSync` in async code paths.
 * Returns `true` when the path is accessible, `false` otherwise.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
