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

  // Navigate to the parent of the target array
  let target: Record<string, unknown> = sectionData;
  for (let i = 0; i < path.length - 1; i++) {
    target = (target[path[i]] as Record<string, unknown>) || {};
  }

  const lastKey = path[path.length - 1];
  const arr = [...((target[lastKey] as T[]) || [])];
  arr[index] = item;

  // Rebuild the nested structure
  const buildPath = (depth: number): Record<string, unknown> => {
    if (depth === path.length - 1) {
      return { ...target, [lastKey]: arr };
    }
    const key = path[depth];
    return {
      ...(depth === 0 ? sectionData : target),
      [key]: buildPath(depth + 1),
    };
  };

  return {
    ...config,
    [section]: buildPath(0),
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

  // Navigate to the parent of the target array
  let target: Record<string, unknown> = sectionData;
  for (let i = 0; i < path.length - 1; i++) {
    target = (target[path[i]] as Record<string, unknown>) || {};
  }

  const lastKey = path[path.length - 1];
  const arr = [...((target[lastKey] as unknown[]) || [])];
  arr.splice(index, 1);

  // Rebuild the nested structure
  const buildPath = (depth: number): Record<string, unknown> => {
    if (depth === path.length - 1) {
      return { ...target, [lastKey]: arr };
    }
    const key = path[depth];
    return {
      ...(depth === 0 ? sectionData : target),
      [key]: buildPath(depth + 1),
    };
  };

  return {
    ...config,
    [section]: buildPath(0),
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

  // Navigate to the parent of the target array
  let target: Record<string, unknown> = sectionData;
  for (let i = 0; i < path.length - 1; i++) {
    target = (target[path[i]] as Record<string, unknown>) || {};
  }

  const lastKey = path[path.length - 1];
  const arr = [...((target[lastKey] as T[]) || []), item];

  // Rebuild the nested structure
  const buildPath = (depth: number): Record<string, unknown> => {
    if (depth === path.length - 1) {
      return { ...target, [lastKey]: arr };
    }
    const key = path[depth];
    return {
      ...(depth === 0 ? sectionData : target),
      [key]: buildPath(depth + 1),
    };
  };

  return {
    ...config,
    [section]: buildPath(0),
  } as GuildConfig;
}
