/**
 * Wraps an async action for use as a zero-argument click handler so rejections surface as exceptions.
 *
 * @param action - Async function to invoke when the returned handler is called
 * @returns A no-argument function that returns the action promise and rethrows any rejection
 */
export function handleAsyncClick(action: () => Promise<void>) {
  return () =>
    action().catch((error: unknown) => {
      throw error;
    });
}
