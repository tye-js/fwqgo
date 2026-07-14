export const DEFAULT_BACKGROUND_JOB_MAX_ATTEMPTS = 3;
export const DEFAULT_BACKGROUND_JOB_RETENTION_DAYS = 14;
export const MAX_BACKGROUND_JOB_RETRY_DELAY_MS = 15 * 60 * 1000;

export function normalizeBackgroundJobMaxAttempts(value: number | undefined) {
  if (!value || !Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_JOB_MAX_ATTEMPTS;
  }

  return Math.max(1, Math.min(20, Math.trunc(value)));
}

export function getBackgroundJobRetryDelayMs(attempts: number) {
  const normalizedAttempts = Number.isFinite(attempts)
    ? Math.max(1, Math.trunc(attempts))
    : 1;
  const baseMs = 30_000;

  return Math.min(
    baseMs * 2 ** Math.max(0, normalizedAttempts - 1),
    MAX_BACKGROUND_JOB_RETRY_DELAY_MS,
  );
}

export function normalizeBackgroundJobRetentionDays(
  value: string | number | null | undefined,
) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_BACKGROUND_JOB_RETENTION_DAYS;
  }

  return Math.max(1, Math.min(365, Math.trunc(parsed)));
}

export function getBackgroundJobRetentionCutoff(
  now: Date,
  retentionDays: number,
) {
  const normalizedDays = normalizeBackgroundJobRetentionDays(retentionDays);
  return new Date(now.getTime() - normalizedDays * 24 * 60 * 60 * 1000);
}
