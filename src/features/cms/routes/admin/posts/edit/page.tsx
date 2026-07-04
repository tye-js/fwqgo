import { Suspense } from "react";
import {
  getPosts,
  getPostCount,
  normalizePostLanguageFilter,
  type PostLanguageFilter,
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

function parsePageNo(value: string | undefined) {
  const parsed = value ? Number.parseInt(value, 10) : 1;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function languageFilterHref(language: PostLanguageFilter) {
  return language === "all"
    ? "/posts/edit"
    : `/posts/edit?language=${language}`;
}

function LanguageFilter({ value }: { value: PostLanguageFilter }) {
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
          <Link href={languageFilterHref(item.value)}>{item.label}</Link>
        </Button>
      ))}
    </div>
  );
}

async function PostListWrapper({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ pageNo?: string; language?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const pageNo = parsePageNo(searchParams.pageNo);
  const language = normalizePostLanguageFilter(searchParams.language);
  const { data: posts, error } = await getPosts({
    pageNo,
    pageSize: 15,
    language,
  });

  if (error || !posts) {
    return <div>获取文章列表失败</div>;
  }

  const { data: postCount } = await getPostCount(language);
  const totalPage = Math.ceil((postCount ?? 0) / 15);

  return (
    <AdminPageShell
      badge="文章管理"
      title="文章列表与快速维护"
      description="在这里集中查看、编辑、删除和校对文章基础信息。列表区沿用统一的后台视觉风格，更适合高频运营操作。"
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
            value: String(posts.length),
            note: "当前页可操作文章",
          },
        ]}
      />
      <AdminSectionCard
        title="全部文章"
        description="支持快速编辑标题、slug、发布状态和封面链接。"
      >
        <div className="mb-4">
          <LanguageFilter value={language} />
        </div>
        <PostList posts={posts} />
        <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function EditPage(props: {
  searchParams: Promise<{ pageNo?: string; language?: string }>;
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
