import { getAdminTagCount, getAdminTagList } from "@/features/cms/data/tag";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { TagSeoTable } from "@/features/cms/components/tag-seo-table";
import { parsePositiveInt } from "@fwqgo/core/utils";
import {
  AdminSectionNav,
  seoManagementNavItems,
} from "@/features/cms/components/admin-section-nav";

function parsePageNo(value: string | undefined) {
  return parsePositiveInt(value) ?? 1;
}

function normalizeQuery(value: string | undefined) {
  return value?.trim().slice(0, 160) ?? "";
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

export default async function Page(props: {
  searchParams: Promise<{ pageNo?: string; query?: string }>;
}) {
  const searchParams = await props.searchParams;
  const pageNo = parsePageNo(searchParams.pageNo);
  const query = normalizeQuery(searchParams.query);
  const result = await Promise.all([
    getAdminTagList({ page: pageNo, pageSize: 20, query }),
    getAdminTagCount(query),
  ]).catch((error: unknown) => {
    console.error("标签 SEO 管理页加载失败:", error);
    return {
      error: getErrorMessage(error),
      tagCount: 0,
      tags: [],
    };
  });
  const data = Array.isArray(result) ? (result[0].data ?? []) : result.tags;
  const tagCount = Array.isArray(result)
    ? (result[1].data ?? 0)
    : result.tagCount;
  const loadError = Array.isArray(result) ? null : result.error;

  const totalPage = Math.ceil((tagCount ?? 0) / 20);

  return (
    <AdminPageShell
      badge="SEO / 标签"
      title="标签 SEO 管理"
    >
      <AdminSectionNav
        label="SEO 管理"
        currentHref="/seo/tag"
        items={seoManagementNavItems}
      />
      {loadError ? (
        <AdminSectionCard
          title="标签列表加载失败"
          description="无法读取标签 SEO 数据，暂时不能批量生成或编辑。请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard
        title="标签列表"
        description="支持单个编辑、单个 AI 生成和选中批量 AI 生成；生成结果会写入中文 Description、Keywords、英文标签、英文 slug、英文 Description 和英文 Keywords。"
      >
        <TagSeoTable
          key={`${pageNo}:${query}`}
          tags={data}
          initialQuery={query}
        />
        <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
