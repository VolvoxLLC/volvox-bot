/**
 * Normalize BOT_API_URL into a stable v1 API base URL.
 *
 * Examples:
 * - http://bot.internal:3001      -> http://bot.internal:3001/api/v1
 * - http://bot.internal:3001/api/v1 -> http://bot.internal:3001/api/v1
 */
export function getBotApiBaseUrl(): string | null {
  const raw = process.env.BOT_API_URL;
  if (!raw) return null;

  const trimmed = raw.replace(/\/+$/, '');
  if (trimmed.endsWith('/api/v1')) {
    return trimmed;
  }

  return `${trimmed}/api/v1`;
}
