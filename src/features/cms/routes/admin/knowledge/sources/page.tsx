import { connection } from "next/server";

import { getKnowledgeSourcesAdmin } from "@/features/cms/actions/knowledge-sources";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { KnowledgeSourceManager } from "@/features/cms/components/knowledge-source-manager";

function dateText(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "—";
}

export default async function KnowledgeSourcesAdminPage() {
  await connection();
  let sources: Awaited<ReturnType<typeof getKnowledgeSourcesAdmin>> = [];
  let loadError: unknown = null;
  try {
    sources = await getKnowledgeSourcesAdmin();
  } catch (error) {
    loadError = error;
  }
  if (loadError) {
    return (
      <AdminPageShell badge="证据治理" title="知识来源工作台">
        <AdminSectionCard title="来源目录暂时不可用">
          <p className="text-sm text-destructive">
            {loadError instanceof Error
              ? loadError.message
              : "请先执行决策基础迁移"}
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }
  return (
    <AdminPageShell
      badge="证据治理"
      title="知识来源工作台"
      description="来源身份和 revision 分开保存；已被文章引用的 revision 不允许覆盖更新。新增来源或 revision 通过受保护的 Server Action 写入并保留审计记录。"
    >
      <AdminSectionCard
        title="来源登记与目录"
        description="先登记来源身份和首个 revision，再在文章或规则发布前绑定具体 claim。"
      >
        <KnowledgeSourceManager sources={sources} />
      </AdminSectionCard>
      <AdminSectionCard
        title="当前来源目录"
        description="A 级规范与官方文档、B 级实测、C 级发现线索分别标记。"
      >
        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="cms-mobile-sticky-actions w-full min-w-[920px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">来源</th>
                <th className="px-3 py-2">等级</th>
                <th className="px-3 py-2">当前 revision</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">复核日期</th>
                <th className="px-3 py-2">链接</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {sources.map((source) => (
                <tr key={source.id}>
                  <td data-mobile-label="来源" className="px-3 py-3">
                    <div className="font-medium">
                      {source.title ?? source.sourceKey}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {source.sourceKey} · {source.kind}
                    </div>
                  </td>
                  <td
                    data-mobile-label="等级"
                    className="px-3 py-3 font-semibold"
                  >
                    {source.authorityTier}
                  </td>
                  <td
                    data-mobile-label="当前 revision"
                    className="px-3 py-3 tabular-nums"
                  >
                    {source.revision ? `r${source.revision}` : "—"}
                  </td>
                  <td data-mobile-label="状态" className="px-3 py-3">
                    {source.status}
                  </td>
                  <td
                    data-mobile-label="复核日期"
                    className="px-3 py-3 text-muted-foreground"
                  >
                    {dateText(source.reviewDueAt)}
                  </td>
                  <td
                    data-mobile-label="链接"
                    className="max-w-[320px] px-3 py-3"
                  >
                    {source.canonicalUrl ? (
                      <a
                        className="break-all text-primary hover:underline"
                        href={source.canonicalUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {source.canonicalUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {sources.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-muted-foreground"
                    colSpan={6}
                  >
                    暂无来源，请先登记首批 RFC、RIR、官方文档和实测协议来源。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
