export function handleAsyncClick(action: () => Promise<void>) {
  return () => {
    action().catch((error: unknown) => {
      throw error;
    });
  };
}
