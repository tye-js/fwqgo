import { desc } from "drizzle-orm";

import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { ShortLinkTable } from "@/features/cms/components/short-link-table";
import { db } from "@fwqgo/db";
import { outboundLinks } from "@fwqgo/db/schema";
import { requireAdminSession } from "@fwqgo/auth/session";

export default async function ShortLinksPage() {
  await requireAdminSession();

  const links = await db
    .select({
      id: outboundLinks.id,
      slug: outboundLinks.slug,
      targetUrl: outboundLinks.targetUrl,
      createdAt: outboundLinks.createdAt,
      updatedAt: outboundLinks.updatedAt,
    })
    .from(outboundLinks)
    .orderBy(desc(outboundLinks.createdAt))
    .limit(300);

  return (
    <AdminPageShell
      badge="推广运营"
      title="短链跳转"
      description="查看文章外链自动生成的 /go/{slug} 跳转，检查目标链接是否正确。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "短链数量",
            value: String(links.length),
            note: "当前最多展示最近 300 条",
          },
          {
            label: "跳转路径",
            value: "/go/{slug}",
            note: "前台负责 302 跳转",
          },
          {
            label: "生成方式",
            value: "自动",
            note: "文章保存时转换外部链接",
          },
        ]}
      />
      <AdminSectionCard>
        <ShortLinkTable
          links={links.map((link) => ({
            ...link,
            createdAt: link.createdAt.toISOString(),
            updatedAt: link.updatedAt?.toISOString() ?? null,
          }))}
        />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
