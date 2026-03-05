/**
 * Normalization utilities for config editor values.
 *
 * Provides consistent transformation of user input (strings, arrays)
 * into API-compatible formats.
 */

/**
 * Parse a comma-separated string into an array of trimmed, non-empty strings.
 *
 * @param raw - The comma-separated input string
 * @returns Array of trimmed, non-empty values
 */
export function parseCommaSeparatedList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Normalize a comma-separated list of role IDs for display.
 * Joins array values with ', ' for consistent formatting.
 *
 * @param roleIds - Array of role ID strings
 * @returns Formatted string for display in inputs
 */
export function formatRoleIdsForDisplay(roleIds: string[]): string {
  return roleIds.join(', ');
}

/**
 * Parse newline-separated text into an array of trimmed, non-empty lines.
 *
 * @param raw - The multiline input string
 * @returns Array of trimmed, non-empty lines
 */
export function parseNewlineSeparatedList(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Parse a numeric text input into a number, applying optional minimum/maximum bounds.
 *
 * @param raw - The input string to parse; an empty string yields `undefined`
 * @param min - Optional lower bound; if the parsed value is less than `min`, `min` is returned
 * @param max - Optional upper bound; if the parsed value is greater than `max`, `max` is returned
 * @returns `undefined` if `raw` is empty or cannot be parsed as a finite number, otherwise the parsed number (clamped to `min`/`max` when provided)
 */
export function parseNumberInput(raw: string, min?: number, max?: number): number | undefined {
  if (raw === '') return undefined;
  const num = Number(raw);
  if (!Number.isFinite(num)) return undefined;
  if (min !== undefined && num < min) return min;
  if (max !== undefined && num > max) return max;
  return num;
}

/**
 * Normalize a threshold percentage (0-100) to a decimal (0-1).
 *
 * @param percent - The percentage value (0-100)
 * @returns Clamped decimal value between 0 and 1
 */
export function percentToDecimal(percent: number): number {
  if (Number.isNaN(percent)) return 0;
  return Math.min(1, Math.max(0, percent / 100));
}

/**
 * Convert a decimal threshold (0-1) to a percentage (0-100) for display.
 *
 * @param decimal - The decimal value (0-1)
 * @returns Percentage value rounded to nearest integer
 */
export function decimalToPercent(decimal: number): number {
  return Math.round(decimal * 100);
}

/**
 * Normalize an optional string value for API storage.
 * Converts empty strings to null, otherwise trims whitespace.
 *
 * @param value - The input string value
 * @returns Trimmed string or null if empty
 */
export function normalizeOptionalString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed || null;
}
