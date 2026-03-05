import type { GuildConfig } from '@/lib/config-utils';

/**
 * Immutable update utilities for guild configuration.
 *
 * These helpers produce new config objects with updated values,
 * preserving immutability and type safety.
 */

/**
 * Update a top-level section's enabled flag.
 *
 * @param config - The current guild config
 * @param section - The section name to update
 * @param enabled - The new enabled value
 * @returns Updated config with the section's enabled flag set
 */
export function updateSectionEnabled<K extends keyof GuildConfig>(
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
 * Update a field within a specific section.
 *
 * @param config - The current guild config
 * @param section - The section name to update
 * @param field - The field name within the section
 * @param value - The new value
 * @returns Updated config with the field set
 */
export function updateSectionField<K extends keyof GuildConfig>(
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
 * Update a nested object field within a section.
 *
 * @param config - The current guild config
 * @param section - The section name to update
 * @param nestedKey - The nested object key (e.g., 'rateLimit', 'protectRoles')
 * @param field - The field name within the nested object
 * @param value - The new value
 * @returns Updated config with the nested field set
 */
export function updateNestedField<K extends keyof GuildConfig>(
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
 * Update an array item at a specific index within a nested path.
 *
 * @param config - The current guild config
 * @param section - The section name
 * @param path - Array of keys to traverse (e.g., ['roleMenu', 'options'])
 * @param index - The index to update
 * @param item - The new item value
 * @returns Updated config with the array item replaced
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
  const arr = [...((cursor[lastKey] as T[]) || [])];

  // Validate index bounds
  if (!Number.isInteger(index) || index < 0) {
    return config;
  }

  if (arr.length === 0 && index === 0) {
    arr.push(item);
  } else if (index >= arr.length) {
    return config;
  } else {
    arr[index] = item;
  }

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
 * Remove an array item at a specific index within a nested path.
 *
 * @param config - The current guild config
 * @param section - The section name
 * @param path - Array of keys to traverse (e.g., ['roleMenu', 'options'])
 * @param index - The index to remove
 * @returns Updated config with the array item removed
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
  const arr = [...((cursor[lastKey] as unknown[]) || [])];

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
 * Append an item to an array within a nested path.
 *
 * @param config - The current guild config
 * @param section - The section name
 * @param path - Array of keys to traverse (e.g., ['roleMenu', 'options'])
 * @param item - The item to append
 * @returns Updated config with the item appended
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
  const arr = [...((cursor[lastKey] as T[]) || []), item];

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
