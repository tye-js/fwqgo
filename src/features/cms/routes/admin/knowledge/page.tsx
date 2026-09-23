import { connection } from "next/server";

import {
  getKnowledgeAdminArticle,
  getKnowledgeAdminOverview,
  getKnowledgeTranslationDraftSource,
} from "@/features/cms/actions/knowledge";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { KnowledgeManager } from "@/features/cms/components/knowledge-manager";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { loadPageData } from "@/features/cms/lib/page-data";
import type { KnowledgeLanguage } from "@/server/knowledge/service";
import {
  firstSearchParam,
  parsePositiveInt,
  parsePostgresIntegerId,
  type SearchParamValue,
} from "@fwqgo/core/utils";

async function loadKnowledgeAdminData(
  query: string,
  selectedId: number | null,
  requestedLanguage: "zh" | "en",
  sourceId: number | null,
  pageNo: number,
) {
  return loadPageData(
    "知识库管理页",
    (async () => {
      // 这两段没有依赖关系，先并行取，再用结果决定 language —— 原来是串行 await，白等一个往返。
      // 注意 translationSource 仍只在「没取到选中文章」时才生效，与改动前的判断一致：
      // 选中的 id 已被删除时同样会退回译文草稿来源。
      const [selectedArticle, translationSourceCandidate] = await Promise.all([
        selectedId ? getKnowledgeAdminArticle(selectedId) : Promise.resolve(null),
        sourceId ? getKnowledgeTranslationDraftSource(sourceId) : Promise.resolve(null),
      ]);
      const translationSource = selectedArticle
        ? null
        : translationSourceCandidate;
      const language: KnowledgeLanguage =
        selectedArticle?.language === "en" || translationSource
          ? "en"
          : requestedLanguage;
      const overview = await getKnowledgeAdminOverview(query, language, {
        pageNo,
      });
      return { overview, selectedArticle, translationSource, language };
    })(),
  );
}

export default async function KnowledgeAdminPage(props: {
  searchParams: Promise<{
    id?: SearchParamValue;
    q?: SearchParamValue;
    language?: SearchParamValue;
    sourceId?: SearchParamValue;
    pageNo?: SearchParamValue;
  }>;
}) {
  await connection();
  const searchParams = await props.searchParams;
  const query = firstSearchParam(searchParams.q)?.trim().slice(0, 120) ?? "";
  const selectedId = parsePostgresIntegerId(searchParams.id);
  const sourceId = parsePostgresIntegerId(searchParams.sourceId);
  const requestedLanguage =
    firstSearchParam(searchParams.language) === "en" ? "en" : "zh";
  const pageNo = parsePositiveInt(searchParams.pageNo) ?? 1;
  const result = await loadKnowledgeAdminData(
    query,
    selectedId,
    requestedLanguage,
    sourceId,
    pageNo,
  );
  const publicOrigin = (
    process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com"
  ).replace(/\/+$/, "");

  if (result.error) {
    return (
      <AdminPageShell badge="内容资产" title="服务器知识库">
        <AdminSectionCard
          title="知识库暂时无法读取"
          description="请先确认知识库数据库迁移已执行，再检查 CMS 数据库连接和后台日志。"
        >
          <p className="break-words text-sm text-destructive">
            {result.error.message}
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  const { overview, selectedArticle, translationSource, language } = result.data;

  return (
    <AdminPageShell badge="内容资产" title="服务器知识库">
      <AdminSectionCard
        title="知识条目与检索配置"
        description="公开条目供用户查询；仅已发布且允许 AI 引用的条目会进入文章改写检索。"
      >
        <KnowledgeManager
          key={`${selectedArticle?.id ?? `new-${translationSource?.id ?? language}`}-${selectedArticle?.updatedAt?.toISOString() ?? "draft"}-p${overview.pagination.pageNo}`}
          categories={overview.categories}
          articles={overview.articles}
          selectedArticle={selectedArticle}
          translationSource={translationSource}
          language={language}
          query={query}
          publicOrigin={publicOrigin}
          listTotal={overview.pagination.totalCount}
          listFooter={
            <PaginationComponent
              pageNo={overview.pagination.pageNo}
              totalPage={overview.pagination.totalPage}
            />
          }
        />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
