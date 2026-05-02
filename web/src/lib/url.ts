/**
 * Remove trailing slash characters from a URL-like string without changing
 * interior slashes or other URL components.
 *
 * @param value - The string to normalize
 * @returns The input string with all trailing `/` characters removed
 */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end -= 1;
  return value.slice(0, end);
}
