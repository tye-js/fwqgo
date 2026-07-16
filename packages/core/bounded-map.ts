type BoundedMapCapacityOptions<K, V> = {
  maxEntries: number;
  incomingEntries?: number;
  isEvictable: (value: V, key: K) => boolean;
  getEvictionPriority?: (value: V, key: K) => number;
};

export function reserveBoundedMapCapacity<K, V>(
  map: Map<K, V>,
  options: BoundedMapCapacityOptions<K, V>,
) {
  const incomingEntries = options.incomingEntries ?? 1;
  if (!Number.isInteger(options.maxEntries) || options.maxEntries < 1) {
    throw new RangeError("maxEntries must be a positive integer");
  }
  if (!Number.isInteger(incomingEntries) || incomingEntries < 0) {
    throw new RangeError("incomingEntries must be a non-negative integer");
  }

  const requiredEntries = Math.max(
    0,
    map.size + incomingEntries - options.maxEntries,
  );
  if (requiredEntries === 0) return true;

  const candidates = [...map.entries()]
    .map(([key, value], order) => ({ key, value, order }))
    .filter(({ key, value }) => options.isEvictable(value, key))
    .map((candidate) => {
      const rawPriority =
        options.getEvictionPriority?.(candidate.value, candidate.key) ??
        candidate.order;
      return {
        ...candidate,
        priority: Number.isFinite(rawPriority)
          ? rawPriority
          : Number.POSITIVE_INFINITY,
      };
    })
    .sort((left, right) => {
      if (left.priority < right.priority) return -1;
      if (left.priority > right.priority) return 1;
      return left.order - right.order;
    });

  for (const candidate of candidates.slice(0, requiredEntries)) {
    map.delete(candidate.key);
  }

  return map.size + incomingEntries <= options.maxEntries;
}
