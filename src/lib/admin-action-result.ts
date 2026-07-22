import { ZodError } from "zod";

export type AdminActionError = {
  code: string;
  title: string;
  message: string;
  suggestion?: string;
  details?: unknown;
};

export type AdminActionFailure = {
  success: false;
  data?: never;
  error: string;
  message: string;
  errorTitle: string;
  actionError: AdminActionError;
};

export type AdminActionSuccess<T> = {
  success: true;
  data: T;
  message?: string;
};

function normalizeUnknownError(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? "请求参数不正确";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "未知错误";
}

export function createAdminActionError(input: {
  code?: string;
  title: string;
  message: string;
  suggestion?: string;
  details?: unknown;
}): AdminActionError {
  return {
    code: input.code ?? "ADMIN_ACTION_FAILED",
    title: input.title,
    message: input.message,
    suggestion: input.suggestion,
    details: input.details,
  };
}

export function toAdminActionError(
  error: unknown,
  input: {
    code?: string;
    title: string;
    suggestion?: string;
    details?: unknown;
  },
) {
  return createAdminActionError({
    code: input.code,
    title: input.title,
    message: normalizeUnknownError(error),
    suggestion: input.suggestion,
    details: input.details,
  });
}

export function adminActionSuccess<T>(
  data: T,
  message?: string,
): AdminActionSuccess<T> {
  return { success: true, data, message };
}

export function adminActionFailure(
  error: unknown,
  input?: {
    code?: string;
    title?: string;
    suggestion?: string;
    details?: unknown;
  },
): AdminActionFailure {
  const actionError =
    error && typeof error === "object" && "title" in error && "message" in error
      ? (error as AdminActionError)
      : toAdminActionError(error, {
          code: input?.code,
          title: input?.title ?? "操作失败",
          suggestion: input?.suggestion,
          details: input?.details,
        });

  return {
    success: false,
    error: actionError.title,
    errorTitle: actionError.title,
    message: actionError.message,
    actionError,
  };
}

export function getErrorMessage(error: unknown) {
  return normalizeUnknownError(error);
}

export function unwrapAdminActionResult<T>(
  result: AdminActionSuccess<T> | AdminActionFailure,
) {
  if (!result.success) throw new Error(result.message);
  return result.data;
}
