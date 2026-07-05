type BackgroundJobInput = {
  key: string;
  label: string;
  run: () => Promise<void>;
};

type BackgroundJobSnapshot = {
  key: string;
  label: string;
  running: boolean;
  runCount: number;
  skippedCount: number;
  lastStartedAt: Date | null;
  lastFinishedAt: Date | null;
  lastError: string | null;
};

const runningJobKeys = new Set<string>();
const jobSnapshots = new Map<string, BackgroundJobSnapshot>();

function getOrCreateJobSnapshot(
  input: Pick<BackgroundJobInput, "key" | "label">,
) {
  const existing = jobSnapshots.get(input.key);
  if (existing) {
    existing.label = input.label;
    return existing;
  }

  const snapshot: BackgroundJobSnapshot = {
    key: input.key,
    label: input.label,
    running: false,
    runCount: 0,
    skippedCount: 0,
    lastStartedAt: null,
    lastFinishedAt: null,
    lastError: null,
  };
  jobSnapshots.set(input.key, snapshot);
  return snapshot;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

export function enqueueAdminBackgroundJob(input: BackgroundJobInput) {
  const snapshot = getOrCreateJobSnapshot(input);

  if (runningJobKeys.has(input.key)) {
    snapshot.skippedCount += 1;
    return false;
  }

  runningJobKeys.add(input.key);
  snapshot.running = true;
  snapshot.runCount += 1;
  snapshot.lastStartedAt = new Date();
  snapshot.lastError = null;

  setTimeout(() => {
    input
      .run()
      .catch((error) => {
        snapshot.lastError = getErrorMessage(error);
        console.error(`${input.label} failed:`, error);
      })
      .finally(() => {
        runningJobKeys.delete(input.key);
        snapshot.running = false;
        snapshot.lastFinishedAt = new Date();
      });
  }, 0);

  return true;
}

export function getAdminBackgroundJobSnapshots() {
  return [...jobSnapshots.values()].map((snapshot) => ({
    ...snapshot,
    lastStartedAt: snapshot.lastStartedAt?.toISOString() ?? null,
    lastFinishedAt: snapshot.lastFinishedAt?.toISOString() ?? null,
  }));
}
