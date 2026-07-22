"use client";

import { useCallback, useRef, useState, useTransition } from "react";
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

export function useAdminMutation() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const pendingKeysRef = useRef<ReadonlySet<string>>(new Set());
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

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
      if (pendingKeysRef.current.has(options.key)) {
        return Promise.resolve({ status: "duplicate" });
      }

      setKeyPending(options.key, true);
      const pendingMessage = asToastMessage(
        options.pendingMessage ?? "正在处理...",
      );
      const toastId = toast.loading(pendingMessage.title, {
        description: pendingMessage.description,
      });

      return new Promise((resolve) => {
        startTransition(async () => {
          let optimisticApplied = false;
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
                runOptimisticCallbackSafely(
                  options.optimistic?.rollback,
                  "rollback",
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
                runOptimisticCallbackSafely(
                  options.optimistic?.rollback,
                  "rollback",
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

            runOptimisticCallbackSafely(options.optimistic?.commit, "commit");
            const successMessage = resolveSuccessMessage(
              options.successMessage,
              result,
            );
            toast.success(successMessage.title, {
              id: toastId,
              description: successMessage.description,
            });
            await runCallbackSafely(options.onSuccess, result, "onSuccess");
            if (options.refresh !== false) {
              router.refresh();
            }
            resolve({ status: "success", result });
          } catch (error) {
            const failure = normalizeAdminMutationError(error, {
              title: options.errorTitle,
              suggestion: options.errorSuggestion,
            });
            if (optimisticApplied) {
              runOptimisticCallbackSafely(
                options.optimistic?.rollback,
                "rollback",
              );
            }
            toast.error(failure.title, {
              id: toastId,
              description: failure.description,
            });
            await runCallbackSafely(options.onError, failure, "onError");
            resolve({ status: "error", failure });
          } finally {
            setKeyPending(options.key, false);
          }
        });
      });
    },
    [router, setKeyPending, startTransition],
  );

  const isPending = useCallback(
    (key: string) => pendingKeys.has(key),
    [pendingKeys],
  );

  return {
    mutate,
    isPending,
    isAnyPending: pendingKeys.size > 0,
  };
}
