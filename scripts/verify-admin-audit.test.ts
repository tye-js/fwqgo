/**
 * `withAdminAudit` 的行为契约。
 *
 * 这个包装是 post.ts / tag.ts / category.ts 这些「保留自定义返回形状」的管理 mutation
 * 唯一进 `admin_audit_logs` 的路径，所以它自己的成败判定、实体 id 解析、异常透传
 * 必须有守卫 —— 判定错了会让审计行说谎，比没有审计更糟。
 *
 * 全程 mock 掉会话与审计写入，不连数据库。
 */
import assert from "node:assert/strict";
import { beforeEach, mock, test } from "bun:test";

type AuditEvent = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  status: "success" | "failure";
  error?: string | null;
  metadata?: Record<string, unknown> | null;
};

const events: AuditEvent[] = [];
let sessionUserId: string | null = "admin-1";

void mock.module("@fwqgo/auth/session", () => ({
  getCurrentSession: async () =>
    sessionUserId ? { user: { id: sessionUserId, role: "admin", status: "active" } } : null,
  requireAdminSession: async () => {
    if (!sessionUserId) throw new Error("Unauthorized");
    return { user: { id: sessionUserId, role: "admin", status: "active" } };
  },
}));

void // withAdminAudit 走的是 scheduleAdminAuditLog（响应之后落库），
// 这里同步捕获事件，好断言「先记 failure 再重抛」这类顺序。
mock.module("@/server/admin/audit-log", () => ({
  scheduleAdminAuditLog: (event: AuditEvent) => {
    events.push(event);
  },
  recordAdminAuditLogSafely: async (event: AuditEvent) => {
    events.push(event);
  },
  writeAdminAuditLog: async () => undefined,
}));

const { withAdminAudit } = await import(
  "../src/features/cms/lib/admin-audit.ts"
);

beforeEach(() => {
  events.length = 0;
  sessionUserId = "admin-1";
});

void test("成功结果记 success，并从 data.id 取实体 id", async () => {
  const action = withAdminAudit(
    { action: "post.create", entityType: "post" },
    async (title: string) => ({ data: { id: 42, title } }),
  );

  const result = await action("hello");

  assert.deepEqual(result, { data: { id: 42, title: "hello" } });
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    actorId: "admin-1",
    action: "post.create",
    entityType: "post",
    entityId: 42,
    status: "success",
    error: null,
    metadata: null,
  });
});

void test("返回值带 error 记 failure，失败原因取 message", async () => {
  const action = withAdminAudit(
    { action: "post.delete", entityType: "post", entityId: ([id]: [number]) => id },
    async () => ({ error: "删除文章失败", message: "外键冲突" }),
  );

  const result = await action(7);

  assert.deepEqual(result, { error: "删除文章失败", message: "外键冲突" });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.status, "failure");
  assert.equal(events[0]?.error, "外键冲突");
  assert.equal(events[0]?.entityId, 7);
});

void test("只有 error 没有 message 时，失败原因回落为 error 文案", async () => {
  const action = withAdminAudit(
    { action: "tag.create", entityType: "tag" },
    async () => ({ error: "标签已存在" }),
  );

  await action();

  assert.equal(events[0]?.status, "failure");
  assert.equal(events[0]?.error, "标签已存在");
});

void test("成功时实体 id 取入参优先于返回值", async () => {
  const action = withAdminAudit(
    { action: "post.update", entityType: "post", entityId: ([input]) => input.id },
    async (_input: { id: number }) => ({ data: { id: 999 } }),
  );

  await action({ id: 5 });

  assert.equal(events[0]?.entityId, 5);
  assert.equal(events[0]?.status, "success");
});

void test("metadata 记录入参，用于留痕批量操作的条数", async () => {
  const action = withAdminAudit(
    {
      action: "post.bulk_delete",
      entityType: "post",
      metadata: ([ids]) => ({ requestedIds: ids.slice(0, 100) }),
    },
    async (ids: number[]) => ({ data: ids.length }),
  );

  await action([3, 4]);

  assert.deepEqual(events[0]?.metadata, { requestedIds: [3, 4] });
});

void test("抛出异常时先排一条 failure 审计，再把异常原样抛出", async () => {
  const boom = new Error("连接池已满");
  const action = withAdminAudit(
    { action: "tag.create", entityType: "tag" },
    async () => {
      throw boom;
    },
  );

  await assert.rejects(action, (error: unknown) => error === boom);

  assert.equal(events.length, 1);
  assert.equal(events[0]?.status, "failure");
  assert.equal(events[0]?.error, "连接池已满");
});

void test("未登录时 actorId 为 null，但仍然落一条审计", async () => {
  sessionUserId = null;
  const action = withAdminAudit(
    { action: "post.delete", entityType: "post", entityId: ([id]: [number]) => id },
    async () => ({ error: "删除文章失败", message: "未登录或登录已过期" }),
  );

  await action(11);

  assert.equal(events.length, 1);
  assert.equal(events[0]?.actorId, null);
  assert.equal(events[0]?.status, "failure");
  assert.equal(events[0]?.entityId, 11);
});

void test("非对象返回值按成功处理，实体 id 为 null", async () => {
  const action = withAdminAudit(
    { action: "tag.create", entityType: "tag" },
    async () => "ok",
  );

  await action();

  assert.equal(events[0]?.status, "success");
  assert.equal(events[0]?.entityId, null);
});
