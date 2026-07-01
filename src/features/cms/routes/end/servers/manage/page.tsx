import { connection } from "next/server";
import { Suspense } from "react";

import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { ServerOfferAdminTable } from "@/features/cms/components/server-offer-admin-table";
import {
  getAdminServerOffers,
  getServerOfferTopicCounts,
} from "@/server/offers/server-offers";

async function ServerOfferManageContent() {
  await connection();

  const [counts, offers] = await Promise.all([
    getServerOfferTopicCounts(),
    getAdminServerOffers(),
  ]);
  const total = counts.reduce((sum, item) => sum + item.count, 0);

  return (
    <AdminPageShell
      badge="服务器套餐"
      title="人工修正数据"
      description="编辑自动提取出的价格、地区、线路、状态、购买链接和优惠码。隐藏的套餐不会出现在前台。"
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
        title="套餐校正"
        description="对提取后的结构化套餐做人工审核、补字段、改状态和控制前台展示。"
      >
        <ServerOfferAdminTable offers={offers} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function ServerOfferManagePage() {
  return (
    <Suspense
      fallback={
        <AdminPageShell
          badge="服务器套餐"
          title="人工修正数据"
          description="正在加载结构化套餐数据。"
        >
          <AdminSectionCard>
            <div className="py-8 text-center text-sm text-muted-foreground">
              正在加载...
            </div>
          </AdminSectionCard>
        </AdminPageShell>
      }
    >
      <ServerOfferManageContent />
    </Suspense>
  );
}
