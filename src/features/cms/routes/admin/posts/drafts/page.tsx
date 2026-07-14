import { Suspense } from "react";
import Link from "next/link";

import {
  getDraftPostCount,
  getDraftPosts,
  normalizePostLanguageFilter,
  normalizePostSort,
  type PostLanguageFilter,
  type PostSort,
} from "@/features/cms/data/post";
import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { PostList } from "@/features/cms/components/posts-tables";
import { Button } from "@/components/ui/button";
import { parsePositiveInt } from "@fwqgo/core/utils";

function parsePageNo(value: string | undefined) {
  return parsePositiveInt(value) ?? 1;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

type DraftListSearchParams = {
  pageNo?: string;
  language?: string;
  query?: string;
  sort?: string;
};

function languageFilterHref(
  language: PostLanguageFilter,
  filters: { query: string; sort: PostSort },
) {
  const params = new URLSearchParams();
  if (language !== "all") params.set("language", language);
  if (filters.query) params.set("query", filters.query);
  if (filters.sort !== "id-desc") params.set("sort", filters.sort);
  const query = params.toString();
  return query ? `/posts/drafts?${query}` : "/posts/drafts";
}

function LanguageFilter({
  value,
  filters,
}: {
  value: PostLanguageFilter;
  filters: { query: string; sort: PostSort };
}) {
  const items: Array<{ value: PostLanguageFilter; label: string }> = [
    { value: "all", label: "全部语言" },
    { value: "zh", label: "中文" },
    { value: "en", label: "英文" },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Button
          key={item.value}
          asChild
          size="sm"
          variant={value === item.value ? "default" : "outline"}
        >
          <Link href={languageFilterHref(item.value, filters)}>
            {item.label}
          </Link>
        </Button>
      ))}
    </div>
  );
}

async function DraftListWrapper({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<DraftListSearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const pageNo = parsePageNo(searchParams.pageNo);
  const language = normalizePostLanguageFilter(searchParams.language);
  const query = searchParams.query?.trim().slice(0, 160) ?? "";
  const sort = normalizePostSort(searchParams.sort);
  const { data: posts, error } = await getDraftPosts({
    pageNo,
    pageSize: 15,
    language,
    query,
    sort,
  });

  const { data: draftCount, error: countError } = await getDraftPostCount({
    language,
    query,
  })
    .then(({ data }) => ({ data, error: null }))
    .catch((countLoadError: unknown) => {
      console.error("草稿箱计数加载失败:", countLoadError);
      return { data: 0, error: getErrorMessage(countLoadError) };
    });
  const loadError = error
    ? getErrorMessage(error)
    : posts
      ? countError
      : "获取草稿列表失败";
  const visiblePosts = posts ?? [];
  const totalPage = Math.ceil((draftCount ?? 0) / 15);

  return (
    <AdminPageShell
      badge="草稿箱"
      title="草稿文章"
      description="AI 改写任务完成后会默认保存到这里，人工确认后再发布。"
      actions={
        <Button asChild>
          <Link href="/ai-rewrite/tasks">采集并改写</Link>
        </Button>
      }
    >
      <AdminSummaryStrip
        items={[
          {
            label: "草稿总数",
            value: String(draftCount ?? 0),
            note: "未发布文章",
          },
          {
            label: "当前页",
            value: String(pageNo),
            note: `共 ${Math.max(totalPage, 1)} 页`,
          },
          {
            label: "本页草稿",
            value: String(visiblePosts.length),
            note: "可继续人工编辑",
          },
        ]}
      />
      {loadError ? (
        <AdminSectionCard
          title="草稿列表加载失败"
          description="无法完整读取草稿列表或分页计数。请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard
        title="待编辑草稿"
        description="可以继续编辑标题、封面、slug 和发布状态；点击 slug 进入完整编辑页。"
      >
        <div className="mb-4">
          <LanguageFilter value={language} filters={{ query, sort }} />
        </div>
        <PostList
          key={`${pageNo}:${language}:${query}:${sort}`}
          posts={visiblePosts}
          editBasePath="/posts/edit"
          initialQuery={query}
          defaultStatusFilter="draft"
          initialSort={sort}
          lockStatusFilter
        />
        <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function DraftsPage(props: {
  searchParams: Promise<DraftListSearchParams>;
}) {
  return (
    <Suspense
      fallback={
        <AdminLoading
          badge="草稿箱"
          title="正在加载草稿"
          description="正在读取待编辑文章和分页信息。"
        />
      }
    >
      <DraftListWrapper searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
