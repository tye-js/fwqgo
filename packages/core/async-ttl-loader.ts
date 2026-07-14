export function createAsyncTtlLoader<T>(
  loader: () => Promise<T>,
  options: { ttlMs: number; now?: () => number },
) {
  const ttlMs = Math.max(1, Math.trunc(options.ttlMs));
  const now = options.now ?? Date.now;
  let cached: { value: T; expiresAt: number } | null = null;
  let pending: Promise<T> | null = null;

  return async function load() {
    const currentTime = now();
    if (cached && cached.expiresAt > currentTime) {
      return cached.value;
    }
    if (pending) return pending;

    pending = loader()
      .then((value) => {
        cached = { value, expiresAt: now() + ttlMs };
        return value;
      })
      .finally(() => {
        pending = null;
      });

    return pending;
  };
}
