import { getCurrentSession } from "@fwqgo/auth/session";
import { getErrorMessage } from "@/lib/admin-action-result";
import { scheduleAdminAuditLog } from "@/server/admin/audit-log";

/** 一次 mutation 的成败判定结果。 */
export type AdminAuditOutcome = {
  status: "success" | "failure";
  /** 失败原因，写进审计行的 `error` 列。 */
  error?: string | null;
};

export type AdminAuditDefinition<TArgs extends unknown[], TResult> = {
  /** 审计动作名，形如 `post.delete`。入库前截断到 160 字符。 */
  action: string;
  /** 实体类型，形如 `post`。入库前截断到 80 字符。 */
  entityType: string;
  /**
   * 从**入参**取实体 id。返回值里带 id 的动作可以不写（会从 `result.id` 或
   * `result.data.id` 兜底）；删除类动作的返回值里没有 id，必须给。
   *
   * 参数是 `run` 的入参元组，用解构取值：`entityId: ([id]) => id`。
   * 这里刻意收成「一个元组参数」而不是 `(...args)`：`(...args)` 会让 TS 从
   * 本字段反推 `TArgs`，与 `run` 的推断打架（实测会把两参动作推成一参）。
   */
  entityId?: (args: TArgs) => string | number | null | undefined;
  /**
   * 失败判定与原因。默认规则：返回值是对象且带非空字符串 `error` 即失败，
   * 失败原因取 `message`（没有则取 `error`）。
   */
  inspect?: (result: TResult) => AdminAuditOutcome;
  /** 额外上下文（如批量操作的条数），写进 `metadata` 列。参数同 `entityId`。 */
  metadata?: (args: TArgs) => Record<string, unknown> | null | undefined;
};

const ENTITY_ID_KEYS = ["id", "postId", "entityId", "slug"] as const;

function readEntityId(value: unknown): string | number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of ENTITY_ID_KEYS) {
    const candidate = record[key];
    if (typeof candidate === "number" || typeof candidate === "string") {
      return candidate;
    }
  }
  // 成功时实体 id 常在 `data` 里（`{ data: { id } }`）。`data === value` 只是防自引用。
  return record.data === value ? null : readEntityId(record.data);
}

function defaultInspect(result: unknown): AdminAuditOutcome {
  if (!result || typeof result !== "object") {
    return { status: "success" };
  }

  const record = result as Record<string, unknown>;
  const error = record.error;
  if (typeof error !== "string" || error.trim().length === 0) {
    return { status: "success" };
  }

  const message = record.message;
  return {
    status: "failure",
    error: typeof message === "string" && message.trim().length > 0 ? message : error,
  };
}

/**
 * 给「已经有自己返回形状」的管理 mutation 补审计日志。
 *
 * ## 为什么需要它，而不是直接用 defineAdminAction
 *
 * `src/features/cms/lib/define-admin-action.ts` 是管理 mutation 的**首选**抽象：它同时做
 * 鉴权、参数解析、审计和 `adminActionSuccess/Failure` 信封。新写的 action 一律用它。
 *
 * 但 `actions/post.ts`、`actions/tag.ts`、`actions/category.ts` 这批老 action 早就返回
 * `{ error }` / `{ error, message }` / `{ data, warnings }` 这类自定义形状，调用点
 * （组件里的 toast 分支）都按这些形状写。把它们改成信封会牵动编辑器、文章列表、SEO 页等
 * 一批调用点，而**审计覆盖本身不需要这个改动**。
 *
 * 所以这里只抽出审计这一件事：结果原样透传，包装层只负责把成败记进 `admin_audit_logs`。
 * 两条路径写的是同一张表、同一个 `scheduleAdminAuditLog`（响应之后落库，不占请求路径）。
 *
 * ## 使用约定
 *
 * - `run` **必须自己做鉴权**（在函数体内调 `requireAdminSession()`），并把失败表达在返回值里
 *   （返回带 `error` 字段的对象），而不是抛异常。这样错误形状与包装前完全一致。
 * - actorId 从当前请求的会话里取。`getCurrentSession` 是 React `cache()` 包过的，
 *   与 `run` 内部的 `requireAdminSession()` 共用同一次查询，不会多打一次库。
 * - 未登录时 `actorId` 为 null，审计仍会落一条 failure —— 这正是需要留痕的情况。
 * - `run` 抛出的异常会被记一条 failure 后**原样重抛**，不改变调用方看到的错误。
 *
 * @example
 * ```ts
 * async function deletePostByIdImpl(id: number) {
 *   try {
 *     await requireAdminSession();
 *     ...
 *     return { data: "删除文章成功" };
 *   } catch (error) {
 *     return { error: "删除文章失败", message: getErrorMessage(error) };
 *   }
 * }
 *
 * export const deletePostById = withAdminAudit(
 *   { action: "post.delete", entityType: "post", entityId: ([id]) => id },
 *   deletePostByIdImpl,
 * );
 * ```
 */
export function withAdminAudit<TArgs extends unknown[], TResult>(
  definition: AdminAuditDefinition<TArgs, TResult>,
  run: (...args: TArgs) => Promise<TResult>,
) {
  return async (...args: TArgs): Promise<TResult> => {
    const session = await getCurrentSession().catch(() => null);
    const actorId = session?.user.id ?? null;

    let result: TResult;
    try {
      result = await run(...args);
    } catch (error) {
      scheduleAdminAuditLog({
        actorId,
        action: definition.action,
        entityType: definition.entityType,
        entityId: definition.entityId?.(args) ?? null,
        status: "failure",
        error: getErrorMessage(error),
      });
      throw error;
    }

    const outcome = (definition.inspect ?? defaultInspect)(result);
    const entityId = definition.entityId?.(args) ?? readEntityId(result) ?? null;

    scheduleAdminAuditLog({
      actorId,
      action: definition.action,
      entityType: definition.entityType,
      entityId,
      status: outcome.status,
      error: outcome.error ?? null,
      metadata: definition.metadata?.(args) ?? null,
    });

    return result;
  };
}
