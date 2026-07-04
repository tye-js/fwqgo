import { toast } from "sonner";

import { type AdminActionError } from "@/lib/admin-action-result";

type AdminToastInput = {
  title: string;
  description?: string;
};

type AdminActionErrorInput = Partial<AdminActionError> & {
  title?: string;
  message?: string;
  suggestion?: string;
};

type AdminActionErrorLike = {
  actionError?: AdminActionErrorInput;
  error?: string | AdminActionErrorInput;
  errorTitle?: string;
  message?: unknown;
};

function buildDescription(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

export function notifySuccess(input: AdminToastInput) {
  toast.success(input.title, {
    description: input.description,
  });
}

export function notifyInfo(input: AdminToastInput) {
  toast.info(input.title, {
    description: input.description,
  });
}

export function notifyError(input: AdminToastInput) {
  toast.error(input.title, {
    description: input.description,
  });
}

export function describeAdminActionError(
  result: AdminActionErrorLike,
  fallbackSuggestion?: string,
) {
  const actionError =
    result.actionError ??
    (result.error && typeof result.error === "object" && "message" in result.error
      ? result.error
      : null);
  const message =
    actionError?.message ??
    (typeof result.message === "string" ? result.message : null) ??
    (typeof result.error === "string" ? result.error : null);
  const suggestion = actionError?.suggestion ?? fallbackSuggestion;

  return buildDescription([message, suggestion]);
}

export function notifyActionError(
  result: AdminActionErrorLike,
  input: { title?: string; fallbackSuggestion?: string } = {},
) {
  const actionError =
    result.actionError ??
    (result.error && typeof result.error === "object" && "title" in result.error
      ? result.error
      : null);
  const title =
    input.title ??
    actionError?.title ??
    result.errorTitle ??
    (typeof result.error === "string" ? result.error : "操作失败");

  notifyError({
    title,
    description: describeAdminActionError(result, input.fallbackSuggestion),
  });
}

export function describeAdminResult(
  parts: Array<string | number | null | undefined>,
) {
  return buildDescription(parts);
}
