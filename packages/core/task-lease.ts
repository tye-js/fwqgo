import { randomUUID } from "node:crypto";

export const TASK_LEASE_DURATION_MS = 2 * 60 * 1000;
export const TASK_LEASE_HEARTBEAT_MS = 20 * 1000;

export class TaskLeaseLostError extends Error {
  constructor() {
    super("Task lease ownership was lost while processing");
    this.name = "TaskLeaseLostError";
  }
}

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
  run: (signal: AbortSignal) => Promise<T>;
  intervalMs?: number;
  onRenewError?: (error: unknown) => void;
}) {
  const controller = new AbortController();
  let renewalRunning = false;
  let leaseLostError: TaskLeaseLostError | null = null;
  const interval = setInterval(() => {
    if (renewalRunning || leaseLostError) return;
    renewalRunning = true;
    void input
      .renew()
      .then((owned) => {
        if (!owned && !leaseLostError) {
          leaseLostError = new TaskLeaseLostError();
          controller.abort(leaseLostError);
        }
      })
      .catch((error) => input.onRenewError?.(error))
      .finally(() => {
        renewalRunning = false;
      });
  }, input.intervalMs ?? TASK_LEASE_HEARTBEAT_MS);
  interval.unref?.();

  try {
    const result = await input.run(controller.signal);
    if (leaseLostError) throw new TaskLeaseLostError();
    return result;
  } catch (error) {
    if (leaseLostError) throw new TaskLeaseLostError();
    throw error;
  } finally {
    clearInterval(interval);
  }
}
