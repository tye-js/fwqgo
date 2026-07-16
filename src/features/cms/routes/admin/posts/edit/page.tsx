import { Suspense } from "react";
import {
  getPosts,
  getPostCount,
  normalizePostLanguageFilter,
  normalizePostSort,
  normalizePostStatusFilter,
  type PostLanguageFilter,
  type PostSort,
  type PostStatusFilter,
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
import Link from "next/link";
import { parsePositiveInt } from "@fwqgo/core/utils";

function parsePageNo(value: string | undefined) {
  return parsePositiveInt(value) ?? 1;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

type PostListSearchParams = {
  pageNo?: string;
  language?: string;
  query?: string;
  status?: string;
  sort?: string;
};

function languageFilterHref(
  language: PostLanguageFilter,
  filters: { query: string; status: PostStatusFilter; sort: PostSort },
) {
  const params = new URLSearchParams();
  if (language !== "all") params.set("language", language);
  if (filters.query) params.set("query", filters.query);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.sort !== "id-desc") params.set("sort", filters.sort);
  const query = params.toString();
  return query ? `/posts/edit?${query}` : "/posts/edit";
}

function LanguageFilter({
  value,
  filters,
}: {
  value: PostLanguageFilter;
  filters: { query: string; status: PostStatusFilter; sort: PostSort };
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

async function PostListWrapper({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<PostListSearchParams>;
}) {
  const searchParams = await searchParamsPromise;
  const pageNo = parsePageNo(searchParams.pageNo);
  const language = normalizePostLanguageFilter(searchParams.language);
  const query = searchParams.query?.trim().slice(0, 160) ?? "";
  const status = normalizePostStatusFilter(searchParams.status);
  const sort = normalizePostSort(searchParams.sort);
  const { data: posts, error } = await getPosts({
    pageNo,
    pageSize: 15,
    language,
    query,
    status,
    sort,
  });

  const { data: postCount, error: countError } = await getPostCount({
    language,
    query,
    status,
  })
    .then(({ data }) => ({ data, error: null }))
    .catch((countLoadError: unknown) => {
      console.error("文章列表计数加载失败:", countLoadError);
      return { data: 0, error: getErrorMessage(countLoadError) };
    });
  const loadError = error
    ? getErrorMessage(error)
    : posts
      ? countError
      : "获取文章列表失败";
  const visiblePosts = posts ?? [];
  const totalPage = Math.ceil((postCount ?? 0) / 15);

  return (
    <AdminPageShell
      badge="内容"
      title="文章库"
      description="集中管理草稿与已发布文章，按语言、状态和关键词筛选后继续编辑、质检或发布。"
      actions={
        <Button asChild>
          <Link href="/ai-rewrite/tasks#single-task">内容生产</Link>
        </Button>
      }
    >
      <AdminSummaryStrip
        items={[
          {
            label: "全部文章",
            value: String(postCount ?? 0),
            note: "文章总量",
          },
          {
            label: "当前页",
            value: String(pageNo),
            note: `共 ${Math.max(totalPage, 1)} 页`,
          },
          {
            label: "本页数量",
            value: String(visiblePosts.length),
            note: "当前页可操作文章",
          },
        ]}
      />
      {loadError ? (
        <AdminSectionCard
          title="文章列表加载失败"
          description="无法完整读取文章列表或分页计数。请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard
        title={status === "draft" ? "草稿文章" : "文章列表"}
        description="支持快速编辑标题、slug、发布状态和封面链接；草稿和已发布文章使用同一套筛选与分页。"
      >
        <div className="mb-4">
          <LanguageFilter value={language} filters={{ query, status, sort }} />
        </div>
        <PostList
          key={`${pageNo}:${language}:${query}:${status}:${sort}`}
          posts={visiblePosts}
          initialQuery={query}
          defaultStatusFilter={status}
          initialSort={sort}
        />
        <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function EditPage(props: {
  searchParams: Promise<PostListSearchParams>;
}) {
  return (
    <Suspense
      fallback={
        <AdminLoading
          badge="文章管理"
          title="正在加载文章列表"
          description="正在读取文章、分页和编辑状态。"
        />
      }
    >
      <PostListWrapper searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
