import { requireAdminSession } from "@fwqgo/auth/session";
import {
  adminActionFailure,
  adminActionSuccess,
  getErrorMessage,
} from "@/lib/admin-action-result";
import { recordAdminAuditLogSafely } from "@/server/admin/audit-log";

type AdminActionDefinition<TInput, TParsed, TResult> = {
  action: string;
  entityType: string;
  parse?: (input: TInput) => TParsed | Promise<TParsed>;
  execute: (input: TParsed, session: { userId: string }) => Promise<TResult>;
  successMessage?: string | ((result: TResult) => string | undefined);
  errorTitle: string;
  errorSuggestion?: string;
  entityId?: (input: TParsed, result?: TResult) => string | number | null | undefined;
};

export function defineAdminAction<TInput, TParsed = TInput, TResult = unknown>(
  definition: AdminActionDefinition<TInput, TParsed, TResult>,
) {
  return async (input: TInput) => {
    let actorId: string | null = null;
    let parsed: TParsed | null = null;
    try {
      const session = await requireAdminSession();
      actorId = session.userId;
      parsed = definition.parse
        ? await definition.parse(input)
        : (input as unknown as TParsed);
      const result = await definition.execute(parsed, session);
      await recordAdminAuditLogSafely({
        actorId,
        action: definition.action,
        entityType: definition.entityType,
        entityId: definition.entityId?.(parsed, result),
        status: "success",
      });
      const message =
        typeof definition.successMessage === "function"
          ? definition.successMessage(result)
          : definition.successMessage;
      return adminActionSuccess(result, message);
    } catch (error) {
      await recordAdminAuditLogSafely({
        actorId,
        action: definition.action,
        entityType: definition.entityType,
        entityId: parsed ? definition.entityId?.(parsed) : null,
        status: "failure",
        error: getErrorMessage(error),
      });
      return adminActionFailure(error, {
        title: definition.errorTitle,
        suggestion: definition.errorSuggestion,
      });
    }
  };
}
