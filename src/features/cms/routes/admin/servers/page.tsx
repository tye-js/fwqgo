import { connection } from "next/server";
import { Suspense } from "react";

import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { ServerOfferImporter } from "@/features/cms/components/server-offer-importer";
import {
  getServerOfferImportPostOptions,
  getServerOfferTopicCounts,
} from "@/server/offers/server-offers";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

async function ServerOffersAdminContent() {
  await connection();

  const result = await Promise.all([
    getServerOfferTopicCounts(),
    getServerOfferImportPostOptions(),
  ])
    .then(([counts, importPosts]) => ({ counts, importPosts, error: null }))
    .catch((error: unknown) => {
      console.error("套餐提取页加载失败:", error);
      return {
        counts: [] as Awaited<ReturnType<typeof getServerOfferTopicCounts>>,
        importPosts: [] as Awaited<
          ReturnType<typeof getServerOfferImportPostOptions>
        >,
        error: getErrorMessage(error),
      };
    });
  const { counts, importPosts, error: loadError } = result;
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  return (
    <AdminPageShell
      badge="服务器套餐"
      title="提取套餐数据"
      description="从单篇文章或历史文章中提取服务器套餐。只有同时识别到具体配置、价格和购买链接的行或段落才会写入套餐库，并自动连接来源文章。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "专题命中",
            value: String(total),
            note: "香港、美国、便宜 VPS 的可见套餐合计",
          },
          {
            label: "香港服务器",
            value: String(
              counts.find((item) => item.slug === "hong-kong")?.count ?? 0,
            ),
            note: "地区字段命中香港",
          },
          {
            label: "便宜 VPS",
            value: String(
              counts.find((item) => item.slug === "cheap-vps")?.count ?? 0,
            ),
            note: "月付美元价格不高于 8",
          },
        ]}
      />
      {loadError ? (
        <AdminSectionCard
          title="套餐提取数据加载失败"
          description="无法读取可选文章或专题计数，暂时不能创建提取任务。请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard
        title="提取套餐数据"
        description="推荐先选择单篇文章提取，确认效果后再批量扫描历史文章。测评文章链接后续可在套餐校正页补充，重复套餐会自动跳过。"
      >
        {loadError ? null : <ServerOfferImporter posts={importPosts} />}
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function ServerOffersAdminPage() {
  return (
    <Suspense
      fallback={
        <AdminLoading
          badge="服务器套餐"
          title="提取套餐数据"
          description="正在加载可提取文章。"
        />
      }
    >
      <ServerOffersAdminContent />
    </Suspense>
  );
}
