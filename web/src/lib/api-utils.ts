/**
 * Shared utilities for API fetch patterns used across dashboard components.
 * Extracted to reduce cognitive complexity in individual fetch callbacks.
 */

/**
 * Safely parse JSON from a Response, returning null on failure.
 */
export async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Extract an error message from an API response payload,
 * falling back to the provided default message.
 */
export function extractApiError(payload: unknown, fallback: string): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof (payload as Record<string, unknown>).error === 'string'
  ) {
    return (payload as Record<string, unknown>).error as string;
  }
  return fallback;
}

/**
 * Returns true if the error is an AbortError (from AbortController).
 */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/**
 * Extracts an error message string from an unknown caught value.
 */
export function toErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
