type AttemptState = {
  count: number;
  resetAt: number;
  lockedUntil: number;
};

type BoundedAttemptTrackerOptions = {
  maxAttempts: number;
  windowMs: number;
  lockMs: number;
  maxEntries: number;
};

export class BoundedAttemptTracker {
  private readonly states = new Map<string, AttemptState>();
  private readonly options: BoundedAttemptTrackerOptions;

  constructor(options: BoundedAttemptTrackerOptions) {
    this.options = {
      maxAttempts: Math.max(1, Math.trunc(options.maxAttempts)),
      windowMs: Math.max(1_000, Math.trunc(options.windowMs)),
      lockMs: Math.max(1_000, Math.trunc(options.lockMs)),
      maxEntries: Math.max(1, Math.trunc(options.maxEntries)),
    };
  }

  get size() {
    return this.states.size;
  }

  private pruneExpired(now: number) {
    for (const [key, state] of this.states) {
      if (state.resetAt <= now && state.lockedUntil <= now) {
        this.states.delete(key);
      }
    }
  }

  private ensureCapacity(now: number) {
    this.pruneExpired(now);

    while (this.states.size >= this.options.maxEntries) {
      const oldestKey = this.states.keys().next().value;
      if (!oldestKey) break;
      this.states.delete(oldestKey);
    }
  }

  getRetryAfterSeconds(keys: string[], now = Date.now()) {
    this.pruneExpired(now);
    let retryAfterMs = 0;

    for (const key of new Set(keys.filter(Boolean))) {
      const state = this.states.get(key);
      if (state?.lockedUntil && state.lockedUntil > now) {
        retryAfterMs = Math.max(retryAfterMs, state.lockedUntil - now);
      }
    }

    return Math.ceil(retryAfterMs / 1_000);
  }

  recordAttempt(keys: string[], now = Date.now()) {
    for (const key of new Set(keys.filter(Boolean))) {
      const previous = this.states.get(key);
      const state =
        previous && previous.resetAt > now
          ? { ...previous }
          : {
              count: 0,
              resetAt: now + this.options.windowMs,
              lockedUntil: 0,
            };

      state.count += 1;
      if (state.count >= this.options.maxAttempts) {
        state.lockedUntil = Math.max(
          state.lockedUntil,
          now + this.options.lockMs,
        );
      }

      this.states.delete(key);
      this.ensureCapacity(now);
      this.states.set(key, state);
    }
  }

  clear(keys: string[]) {
    for (const key of new Set(keys.filter(Boolean))) {
      this.states.delete(key);
    }
  }
}
