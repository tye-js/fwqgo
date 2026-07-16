type AsyncCleanup = () => void | Promise<void>;

export async function withAsyncRollback<T>(
  work: (defer: (cleanup: AsyncCleanup) => void) => Promise<T>,
) {
  const cleanups: AsyncCleanup[] = [];

  try {
    return await work((cleanup) => cleanups.push(cleanup));
  } catch (error) {
    for (let index = cleanups.length - 1; index >= 0; index -= 1) {
      try {
        await cleanups[index]?.();
      } catch {
        // Preserve the operation error while attempting every cleanup.
      }
    }

    throw error;
  }
}
