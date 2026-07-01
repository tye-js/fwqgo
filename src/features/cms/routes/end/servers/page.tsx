import { connection } from "next/server";
import { Suspense } from "react";

import { AdminPageShell, AdminSectionCard, AdminSummaryStrip } from "@/app/_components/admin-page-shell";
import { ServerOfferImporter } from "@/app/_components/server-offer-importer";
import {
  getServerOfferImportPostOptions,
  getServerOfferTopicCounts,
} from "@/server/offers/server-offers";

async function ServerOffersAdminContent() {
  await connection();

  const [counts, importPosts] = await Promise.all([
    getServerOfferTopicCounts(),
    getServerOfferImportPostOptions(),
  ]);
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  return (
    <AdminPageShell
      badge="服务器套餐"
      title="提取套餐数据"
      description="从单篇文章或历史文章中提取服务器套餐。系统优先读取表格行，再回退解析正文段落。"
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
      <AdminSectionCard
        title="提取套餐数据"
        description="推荐先选择单篇文章提取，确认效果后再批量扫描历史文章。重复套餐会自动跳过。"
      >
        <ServerOfferImporter posts={importPosts} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function ServerOffersAdminPage() {
  return (
    <Suspense
      fallback={
        <AdminPageShell
          badge="服务器套餐"
          title="提取套餐数据"
          description="正在加载可提取文章。"
        >
          <AdminSectionCard>
            <div className="py-8 text-center text-sm text-muted-foreground">
              正在加载...
            </div>
          </AdminSectionCard>
        </AdminPageShell>
      }
    >
      <ServerOffersAdminContent />
    </Suspense>
  );
}
