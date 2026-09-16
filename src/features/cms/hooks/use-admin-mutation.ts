"use client";

import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  normalizeAdminMutationError,
  normalizeAdminMutationFailure,
  type NormalizedAdminMutationFailure,
  updatePendingAdminMutationKeys,
} from "@/features/cms/lib/admin-mutation";

type AdminMutationToast = {
  title: string;
  description?: string;
};

type AdminMutationToastResolver<TResult> =
  | string
  | AdminMutationToast
  | ((result: TResult) => string | AdminMutationToast);

export type AdminMutationSuccessTone = "success" | "warning";

type AdminMutationSuccessToneResolver<TResult> =
  AdminMutationSuccessTone | ((result: TResult) => AdminMutationSuccessTone);

type AdminMutationOptimisticUpdate = {
  apply: () => void;
  rollback?: () => void;
  commit?: () => void;
};

export type AdminMutationOptions<TResult> = {
  key: string;
  action: () => Promise<TResult>;
  pendingMessage?: string | AdminMutationToast;
  successMessage?: AdminMutationToastResolver<TResult>;
  successTone?: AdminMutationSuccessToneResolver<TResult>;
  errorTitle?: string;
  errorSuggestion?: string;
  optimistic?: AdminMutationOptimisticUpdate;
  onSuccess?: (result: TResult) => void | Promise<void>;
  onError?: (failure: NormalizedAdminMutationFailure) => void | Promise<void>;
  refresh?: boolean;
};

export type AdminMutationOutcome<TResult> =
  | { status: "success"; result: TResult }
  | { status: "error"; failure: NormalizedAdminMutationFailure }
  | { status: "duplicate" };

function asToastMessage(
  message: string | AdminMutationToast,
): AdminMutationToast {
  return typeof message === "string" ? { title: message } : message;
}

function getResultMessage(result: unknown) {
  if (!result || typeof result !== "object" || !("message" in result)) {
    return null;
  }
  return typeof result.message === "string" && result.message.trim()
    ? result.message.trim()
    : null;
}

function resolveSuccessMessage<TResult>(
  message: AdminMutationToastResolver<TResult> | undefined,
  result: TResult,
) {
  const resolved = typeof message === "function" ? message(result) : message;
  return asToastMessage(resolved ?? getResultMessage(result) ?? "操作已完成");
}

function resolveSuccessTone<TResult>(
  tone: AdminMutationSuccessToneResolver<TResult> | undefined,
  result: TResult,
) {
  return typeof tone === "function" ? tone(result) : (tone ?? "success");
}

async function runCallbackSafely<TValue>(
  callback: ((value: TValue) => void | Promise<void>) | undefined,
  value: TValue,
  label: string,
) {
  if (!callback) return;
  try {
    await callback(value);
  } catch (error) {
    console.error(`[useAdminMutation] ${label} 回调执行失败`, error);
  }
}

function runOptimisticCallbackSafely(
  callback: (() => void) | undefined,
  label: string,
) {
  if (!callback) return;
  try {
    callback();
  } catch (error) {
    console.error(`[useAdminMutation] ${label} 回调执行失败`, error);
  }
}

const emptyPendingKeys: ReadonlySet<string> = new Set();

export function useAdminMutation() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const pendingKeysRef = useRef<ReadonlySet<string>>(new Set());
  const inFlightKeysRef = useRef(new Set<string>());
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [transitionPendingKeys, markTransitionPending] = useOptimistic(
    emptyPendingKeys,
    (current, update: { key: string; pending: boolean }) =>
      updatePendingAdminMutationKeys(current, update.key, update.pending),
  );

  useEffect(() => {
    // Release locks only after the matching UI update has committed. A stale
    // effect must not unlock a newer request before its pending state renders.
    if (pendingKeys !== pendingKeysRef.current) return;
    for (const key of inFlightKeysRef.current) {
      if (!pendingKeys.has(key) && !transitionPendingKeys.has(key)) {
        inFlightKeysRef.current.delete(key);
      }
    }
  }, [pendingKeys, transitionPendingKeys]);

  const setKeyPending = useCallback((key: string, pending: boolean) => {
    const next = updatePendingAdminMutationKeys(
      pendingKeysRef.current,
      key,
      pending,
    );
    pendingKeysRef.current = next;
    setPendingKeys(next);
  }, []);

  const mutate = useCallback(
    <TResult>(
      options: AdminMutationOptions<TResult>,
    ): Promise<AdminMutationOutcome<TResult>> => {
      if (inFlightKeysRef.current.has(options.key)) {
        return Promise.resolve({ status: "duplicate" });
      }

      inFlightKeysRef.current.add(options.key);
      setKeyPending(options.key, true);
      const pendingMessage = asToastMessage(
        options.pendingMessage ?? "正在处理...",
      );
      const toastId = toast.loading(pendingMessage.title, {
        description: pendingMessage.description,
      });

      return new Promise((resolve) => {
        startTransition(async () => {
          markTransitionPending({ key: options.key, pending: true });
          let optimisticApplied = false;
          let acceptedResult: { value: TResult } | null = null;
          let waitForRefresh = false;
          try {
            optimisticApplied = Boolean(options.optimistic);
            options.optimistic?.apply();

            let result: TResult;
            try {
              result = await options.action();
            } catch (error) {
              const failure = normalizeAdminMutationError(error, {
                title: options.errorTitle,
                suggestion: options.errorSuggestion,
              });
              if (optimisticApplied) {
                startTransition(() =>
                  runOptimisticCallbackSafely(
                    options.optimistic?.rollback,
                    "rollback",
                  ),
                );
              }
              toast.error(failure.title, {
                id: toastId,
                description: failure.description,
              });
              await runCallbackSafely(options.onError, failure, "onError");
              resolve({ status: "error", failure });
              return;
            }

            const failure = normalizeAdminMutationFailure(result, {
              title: options.errorTitle,
              suggestion: options.errorSuggestion,
            });
            if (failure) {
              if (optimisticApplied) {
                startTransition(() =>
                  runOptimisticCallbackSafely(
                    options.optimistic?.rollback,
                    "rollback",
                  ),
                );
              }
              toast.error(failure.title, {
                id: toastId,
                description: failure.description,
              });
              await runCallbackSafely(options.onError, failure, "onError");
              resolve({ status: "error", failure });
              return;
            }

            acceptedResult = { value: result };
            startTransition(() =>
              runOptimisticCallbackSafely(options.optimistic?.commit, "commit"),
            );
            const successMessage = resolveSuccessMessage(
              options.successMessage,
              result,
            );
            const successTone = resolveSuccessTone(options.successTone, result);
            const showSuccessToast =
              successTone === "warning" ? toast.warning : toast.success;
            showSuccessToast(successMessage.title, {
              id: toastId,
              description: successMessage.description,
            });
            await runCallbackSafely(options.onSuccess, result, "onSuccess");
            if (options.refresh !== false) {
              waitForRefresh = true;
              startTransition(() => router.refresh());
            }
            resolve({ status: "success", result });
          } catch (error) {
            if (acceptedResult) {
              toast.warning("操作已提交，页面同步失败", {
                id: toastId,
                description: "请刷新查看最新状态，避免重复提交。",
              });
              resolve({ status: "success", result: acceptedResult.value });
              return;
            }
            const failure = normalizeAdminMutationError(error, {
              title: options.errorTitle,
              suggestion: options.errorSuggestion,
            });
            if (optimisticApplied) {
              startTransition(() =>
                runOptimisticCallbackSafely(
                  options.optimistic?.rollback,
                  "rollback",
                ),
              );
            }
            toast.error(failure.title, {
              id: toastId,
              description: failure.description,
            });
            await runCallbackSafely(options.onError, failure, "onError");
            resolve({ status: "error", failure });
          } finally {
            if (!waitForRefresh) {
              startTransition(() =>
                markTransitionPending({ key: options.key, pending: false }),
              );
            }
            setKeyPending(options.key, false);
          }
        });
      });
    },
    [router, setKeyPending, startTransition, markTransitionPending],
  );

  const isPending = useCallback(
    (key: string) => pendingKeys.has(key) || transitionPendingKeys.has(key),
    [pendingKeys, transitionPendingKeys],
  );

  return {
    mutate,
    isPending,
    isAnyPending: pendingKeys.size > 0 || transitionPendingKeys.size > 0,
  };
}
