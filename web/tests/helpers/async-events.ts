/**
 * Wraps an async action for use as a zero-argument click handler so rejections surface as exceptions.
 *
 * @param action - Async function to invoke when the returned handler is called
 * @returns A no-argument function that calls `action` and rethrows any rejection
 * @throws The error produced by `action` if it rejects
 */
export function handleAsyncClick(action: () => Promise<void>) {
  return () => {
    action().catch((error: unknown) => {
      throw error;
    });
  };
}
