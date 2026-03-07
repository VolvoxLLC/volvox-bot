import type { GuildConfig } from '@/lib/config-utils';

/**
 * Immutable update utilities for guild configuration.
 *
 * These helpers produce new config objects with updated values,
 * preserving immutability and type safety.
 */

/**
 * Keys of GuildConfig that represent object-valued config sections (excludes scalar
 * fields like `guildId`). Prevents scalar-key misuse in section helpers.
 * The `& string` ensures the type is usable as a computed property key.
 */
export type GuildConfigSectionKey = Exclude<keyof GuildConfig, 'guildId'> & string;

/**
 * Update a top-level section's enabled flag.
 *
 * @param config - The current guild config
 * @param section - The section name to update (must be an object-valued key)
 * @param enabled - The new enabled value
 * @returns Updated config with the section's enabled flag set
 */
export function updateSectionEnabled<K extends GuildConfigSectionKey>(
  config: GuildConfig,
  section: K,
  enabled: boolean,
): GuildConfig {
  return {
    ...config,
    [section]: {
      ...((config[section] as Record<string, unknown>) || {}),
      enabled,
    },
  } as GuildConfig;
}

/**
 * Set a specific field on a top-level section and return an updated config.
 *
 * @param config - The original guild configuration
 * @param section - The top-level section key to update (must be an object-valued key)
 * @param field - The field name within the section to set
 * @param value - The value to assign to the field
 * @returns A new GuildConfig with `field` set to `value` inside `section`
 */
export function updateSectionField<K extends GuildConfigSectionKey>(
  config: GuildConfig,
  section: K,
  field: string,
  value: unknown,
): GuildConfig {
  return {
    ...config,
    [section]: {
      ...((config[section] as Record<string, unknown>) || {}),
      [field]: value,
    },
  } as GuildConfig;
}

/**
 * Set a field inside a nested object of a top-level section.
 *
 * Produces a new GuildConfig with the specified nested field updated; the input config is not mutated.
 *
 * @param config - The current guild configuration object
 * @param section - Top-level section key to update
 * @param nestedKey - Key of the nested object within the section (e.g., "rateLimit", "protectRoles")
 * @param field - Field name within the nested object to set
 * @param value - New value for the specified field
 * @returns The updated GuildConfig with the nested field set
 */
export function updateNestedField<K extends GuildConfigSectionKey>(
  config: GuildConfig,
  section: K,
  nestedKey: string,
  field: string,
  value: unknown,
): GuildConfig {
  const sectionData = (config[section] as Record<string, unknown>) || {};
  const nestedData = (sectionData[nestedKey] as Record<string, unknown>) || {};

  return {
    ...config,
    [section]: {
      ...sectionData,
      [nestedKey]: {
        ...nestedData,
        [field]: value,
      },
    },
  } as GuildConfig;
}

/**
 * Replace the item at a specific index inside a nested array path of a guild section.
 *
 * If the provided path is empty or the index is not an integer or out of bounds, the original config is returned unchanged.
 *
 * @param path - Sequence of keys that locates the target array within the section (e.g., ['roleMenu', 'options'])
 * @param index - Zero-based index of the array element to replace
 * @param item - The new value to place at `index`
 * @returns A new GuildConfig with the array item replaced, or the original `config` if no update was performed
 */
export function updateArrayItem<T>(
  config: GuildConfig,
  section: keyof GuildConfig,
  path: string[],
  index: number,
  item: T,
): GuildConfig {
  const sectionData = (config[section] as Record<string, unknown>) || {};

  // Handle edge case: empty path
  if (path.length === 0) return config;

  // Track each level's data during traversal for correct rebuilding
  const levels: Record<string, unknown>[] = [sectionData];
  let cursor: Record<string, unknown> = sectionData;
  for (let i = 0; i < path.length - 1; i++) {
    const next = (cursor[path[i]] as Record<string, unknown>) || {};
    levels.push(next);
    cursor = next;
  }

  const lastKey = path[path.length - 1];

  // Guard: if the target is not an array, bail out rather than spreading a non-iterable
  if (!Array.isArray(cursor[lastKey])) return config;

  const arr = [...(cursor[lastKey] as T[])];

  // Validate index bounds
  if (!Number.isInteger(index) || index < 0 || index >= arr.length) {
    return config;
  }

  arr[index] = item;

  // Rebuild from bottom up using tracked levels
  let rebuilt: Record<string, unknown> = { ...cursor, [lastKey]: arr };
  for (let i = path.length - 2; i >= 0; i--) {
    rebuilt = { ...levels[i], [path[i]]: rebuilt };
  }

  return {
    ...config,
    [section]: rebuilt,
  } as GuildConfig;
}

/**
 * Remove an item from an array located at a nested path under a top-level section.
 *
 * @param config - The current guild configuration
 * @param section - Top-level section key containing the nested path
 * @param path - Sequence of keys to traverse to the target array (e.g., ['roleMenu', 'options'])
 * @param index - The index of the item to remove
 * @returns A new GuildConfig with the item removed. If `path` is empty or `index` is not an integer or out of bounds, returns the original config unchanged.
 */
export function removeArrayItem(
  config: GuildConfig,
  section: keyof GuildConfig,
  path: string[],
  index: number,
): GuildConfig {
  const sectionData = (config[section] as Record<string, unknown>) || {};

  // Handle edge case: empty path
  if (path.length === 0) return config;

  // Track each level's data during traversal for correct rebuilding
  const levels: Record<string, unknown>[] = [sectionData];
  let cursor: Record<string, unknown> = sectionData;
  for (let i = 0; i < path.length - 1; i++) {
    const next = (cursor[path[i]] as Record<string, unknown>) || {};
    levels.push(next);
    cursor = next;
  }

  const lastKey = path[path.length - 1];

  // Guard: if the target is not an array, bail out rather than spreading a non-iterable
  if (!Array.isArray(cursor[lastKey])) return config;

  const arr = [...(cursor[lastKey] as unknown[])];

  // Validate index bounds
  if (!Number.isInteger(index) || index < 0 || index >= arr.length) {
    return config;
  }

  arr.splice(index, 1);

  // Rebuild from bottom up using tracked levels
  let rebuilt: Record<string, unknown> = { ...cursor, [lastKey]: arr };
  for (let i = path.length - 2; i >= 0; i--) {
    rebuilt = { ...levels[i], [path[i]]: rebuilt };
  }

  return {
    ...config,
    [section]: rebuilt,
  } as GuildConfig;
}

/**
 * Appends an item to an array located at a nested path within a section of the guild configuration.
 *
 * If the path is empty the original config is returned. Missing intermediate objects are created as plain objects
 * and a missing target array is treated as empty before appending.
 *
 * @param config - The current guild configuration
 * @param section - Top-level section key in the config to update
 * @param path - Sequence of keys that locate the target array inside the section (last key identifies the array)
 * @param item - The item to append to the target array
 * @returns The updated GuildConfig with the item appended to the target array (or the original config if the path is empty)
 */
export function appendArrayItem<T>(
  config: GuildConfig,
  section: keyof GuildConfig,
  path: string[],
  item: T,
): GuildConfig {
  const sectionData = (config[section] as Record<string, unknown>) || {};

  // Handle edge case: empty path
  if (path.length === 0) return config;

  // Track each level's data during traversal for correct rebuilding
  const levels: Record<string, unknown>[] = [sectionData];
  let cursor: Record<string, unknown> = sectionData;
  for (let i = 0; i < path.length - 1; i++) {
    const next = (cursor[path[i]] as Record<string, unknown>) || {};
    levels.push(next);
    cursor = next;
  }

  const lastKey = path[path.length - 1];
  const arr = [...(Array.isArray(cursor[lastKey]) ? (cursor[lastKey] as T[]) : []), item];

  // Rebuild from bottom up using tracked levels
  let rebuilt: Record<string, unknown> = { ...cursor, [lastKey]: arr };
  for (let i = path.length - 2; i >= 0; i--) {
    rebuilt = { ...levels[i], [path[i]]: rebuilt };
  }

  return {
    ...config,
    [section]: rebuilt,
  } as GuildConfig;
}
