/**
 * Path expansion utilities
 */

/**
 * Get an environment variable safely (works in browser and Node)
 */
function getEnv(name: string): string {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name] || '';
  }
  return '';
}

/**
 * Expand ~ and environment variables in a path
 * @param p - Path to expand
 * @returns Expanded path
 */
export function expandPath(p: string): string {
  // Replace ~ with home directory
  // Replace environment variables like $VAR
  return p.replace(/^~/, getEnv('HOME')).replace(/\$(\w+)/g, (_, name) => getEnv(name));
}
