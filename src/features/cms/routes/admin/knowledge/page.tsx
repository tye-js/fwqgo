import { connection } from "next/server";

import {
  getKnowledgeAdminArticle,
  getKnowledgeAdminOverview,
} from "@/features/cms/actions/knowledge";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { KnowledgeManager } from "@/features/cms/components/knowledge-manager";
import { parsePostgresIntegerId } from "@fwqgo/core/utils";

async function loadKnowledgeAdminData(
  query: string,
  selectedId: number | null,
) {
  try {
    const [overview, selectedArticle] = await Promise.all([
      getKnowledgeAdminOverview(query),
      selectedId ? getKnowledgeAdminArticle(selectedId) : Promise.resolve(null),
    ]);
    return { ok: true as const, overview, selectedArticle };
  } catch (error) {
    console.error("知识库管理页加载失败:", error);
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "未知错误",
    };
  }
}

export default async function KnowledgeAdminPage(props: {
  searchParams: Promise<{ id?: string; q?: string }>;
}) {
  await connection();
  const searchParams = await props.searchParams;
  const query = searchParams.q?.trim().slice(0, 120) ?? "";
  const selectedId = parsePostgresIntegerId(searchParams.id);
  const result = await loadKnowledgeAdminData(query, selectedId);
  const publicOrigin = (
    process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com"
  ).replace(/\/+$/, "");

  if (result.ok) {
    return (
      <AdminPageShell badge="内容资产" title="服务器知识库">
        <AdminSectionCard
          title="知识条目与检索配置"
          description="公开条目供用户查询；仅已发布且允许 AI 引用的条目会进入文章改写检索。"
        >
          <KnowledgeManager
            key={`${result.selectedArticle?.id ?? "new"}-${result.selectedArticle?.updatedAt?.toISOString() ?? "draft"}`}
            categories={result.overview.categories}
            articles={result.overview.articles}
            selectedArticle={result.selectedArticle}
            query={query}
            publicOrigin={publicOrigin}
          />
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell badge="内容资产" title="服务器知识库">
      <AdminSectionCard
        title="知识库暂时无法读取"
        description="请先确认知识库数据库迁移已执行，再检查 CMS 数据库连接和后台日志。"
      >
        <p className="break-words text-sm text-destructive">{result.message}</p>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
