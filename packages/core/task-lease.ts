import { randomUUID } from "node:crypto";

export const TASK_LEASE_DURATION_MS = 2 * 60 * 1000;
export const TASK_LEASE_HEARTBEAT_MS = 20 * 1000;

export function createTaskLeaseOwner(queue: string) {
  return `${queue}:${process.pid}:${randomUUID()}`;
}

export function getTaskLeaseExpiry(
  now = new Date(),
  durationMs = TASK_LEASE_DURATION_MS,
) {
  return new Date(now.getTime() + durationMs);
}

export function isTaskLeaseExpired(
  expiresAt: Date | null | undefined,
  now = new Date(),
) {
  return !expiresAt || expiresAt.getTime() <= now.getTime();
}

export async function withTaskLeaseHeartbeat<T>(input: {
  renew: () => Promise<boolean>;
  run: () => Promise<T>;
  intervalMs?: number;
  onRenewError?: (error: unknown) => void;
}) {
  const interval = setInterval(() => {
    void input.renew().catch((error) => input.onRenewError?.(error));
  }, input.intervalMs ?? TASK_LEASE_HEARTBEAT_MS);
  interval.unref?.();

  try {
    return await input.run();
  } finally {
    clearInterval(interval);
  }
}
