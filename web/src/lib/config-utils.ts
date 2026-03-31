import type { BotConfig, DeepPartial } from '@/types/config';

/** Config sections exposed by the API — all fields optional for partial API responses. */
export type GuildConfig = DeepPartial<BotConfig>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenObjectToLeafPatches(
  obj: Record<string, unknown>,
  prefix: string,
): Array<{ path: string; value: unknown }> {
  const entries = Object.entries(obj);
  if (entries.length === 0) {
    return [{ path: prefix, value: {} }];
  }

  const patches: Array<{ path: string; value: unknown }> = [];

  for (const [key, value] of entries) {
    const fullPath = `${prefix}.${key}`;
    if (isPlainObject(value)) {
      patches.push(...flattenObjectToLeafPatches(value, fullPath));
    } else {
      patches.push({ path: fullPath, value });
    }
  }

  return patches;
}

/**
 * Determine whether two JSON-serializable values are deeply equal by recursively comparing primitives, arrays, and plain objects.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  if (typeof a === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.hasOwn(bObj, key) && deepEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Compute a flat list of dot-path patches that describe differences between two guild configs.
 *
 * Skips the root-level `guildId`, recurses into plain objects to emit leaf-level changes,
 * and produces a patch for any differing non-object value or array.
 */
export function computePatches(
  original: GuildConfig,
  modified: GuildConfig,
): Array<{ path: string; value: unknown }> {
  const patches: Array<{ path: string; value: unknown }> = [];

  function walk(origObj: Record<string, unknown>, modObj: Record<string, unknown>, prefix: string) {
    const allKeys = new Set([...Object.keys(origObj), ...Object.keys(modObj)]);

    for (const key of allKeys) {
      if (prefix === '' && key === 'guildId') continue;

      const fullPath = prefix ? `${prefix}.${key}` : key;
      const modHasKey = Object.hasOwn(modObj, key);
      const origVal = origObj[key];
      const modVal = modObj[key];

      if (deepEqual(origVal, modVal)) continue;

      if (isPlainObject(origVal) && isPlainObject(modVal)) {
        walk(origVal as Record<string, unknown>, modVal as Record<string, unknown>, fullPath);
      } else if (!modHasKey || modVal === undefined) {
        if (isPlainObject(origVal)) {
          patches.push({ path: fullPath, value: {} });
        } else {
          patches.push({ path: fullPath, value: null });
        }
      } else if (isPlainObject(modVal)) {
        patches.push(...flattenObjectToLeafPatches(modVal, fullPath));
      } else {
        patches.push({ path: fullPath, value: modVal });
      }
    }
  }

  walk(
    original as unknown as Record<string, unknown>,
    modified as unknown as Record<string, unknown>,
    '',
  );

  return patches;
}
