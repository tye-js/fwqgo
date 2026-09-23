import { count } from "drizzle-orm";
import { cacheLife } from "next/cache";

import { db } from "@fwqgo/db";
import {
  adminBackgroundJobs,
  aiRewriteTasks,
  imageCoverGenerationTasks,
  providerMonitorRuns,
} from "@fwqgo/db/schema";

/**
 * 任务队列的状态计数（AI 改写 / 封面生图 / 供应商采集 / 后台任务）。
 *
 * ## 为什么单独抽出来
 *
 * 同一段 `GROUP BY status` 聚合原本在两个地方各写一遍：
 * `getCmsTaskOperationsSummary()`（AI任务中心，3 张表）与 `getDashboardStats()`（运营工作台，
 * 4 张表），**重叠的 3 张表各算一次**。而 `useAdminMutation` 默认会 `router.refresh()`，
 * 每提交一次表单，两个页面的数据加载器都会重跑，于是同一份事实被反复计算、缓存 0 次。
 *
 * 现在两处都读这里，一次计算、进程内缓存。
 *
 * ## 为什么只给 cacheLife、不给 tag
 *
 * 这 4 张表有 **14 个写入点**，其中多数在后台 worker 里
 * （`rewrite-task-runner` / `cover-generation-task-runner` / `background-jobs` / `provider-monitor` …）。
 * 想靠 `revalidateTag` 做到「写完立刻刷新计数」，就得把 revalidation 撒进这 14 处，
 * 每加一个写入点都可能漏掉 —— 漏掉的表现是计数**永久**停在一个旧值上，比慢几秒糟得多。
 *
 * 这里选的是有界的新鲜度：`revalidate: 5` 秒。计数最多滞后 5 秒，
 * 而且没有任何「忘记 revalidate」的失败模式。如果以后确实需要即时计数，
 * 正确的做法是在 runner 的状态流转处（而不是每个 `.update()` 调用点）统一 revalidate。
 *
 * ## 两条硬约束
 *
 * - **不要在缓存函数里调 `requireAdminSession()`**：它读 cookies，会让函数变成请求相关的，
 *   而 `"use cache"` 要求函数不含请求相关输入。鉴权留在调用方
 *   （`getDashboardStats` / `getCmsTaskOperationsSummary` 各自已经调了）。
 * - 只读 `db`（写库）。任务表只存在于写库，公开侧读 `readDb` 的约定不受影响。
 */
export async function getTaskQueueStatusCounts() {
  "use cache";
  cacheLife({ stale: 5, revalidate: 5, expire: 60 });

  const [ai, cover, offer, background] = await Promise.all([
    db
      .select({ status: aiRewriteTasks.status, count: count() })
      .from(aiRewriteTasks)
      .groupBy(aiRewriteTasks.status),
    db
      .select({
        status: imageCoverGenerationTasks.status,
        count: count(),
      })
      .from(imageCoverGenerationTasks)
      .groupBy(imageCoverGenerationTasks.status),
    db
      .select({ status: providerMonitorRuns.status, count: count() })
      .from(providerMonitorRuns)
      .groupBy(providerMonitorRuns.status),
    db
      .select({ status: adminBackgroundJobs.status, count: count() })
      .from(adminBackgroundJobs)
      .groupBy(adminBackgroundJobs.status),
  ]);

  return { ai, cover, offer, background };
}

export type TaskQueueStatusRow = {
  status: string;
  count: number;
};
