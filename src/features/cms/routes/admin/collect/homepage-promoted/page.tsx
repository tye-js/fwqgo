import { Suspense } from "react";

import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import {
  getHomepagePromotedPostList,
  getPublishedPostOptions,
} from "@/features/cms/actions/homepage-promoted-post";
import { HomepagePromotedPostTable } from "@/features/cms/components/homepage-promoted-post-table";
import { Button } from "@/components/ui/button";
import Link from "next/link";

function normalizeLanguage(value?: string): "zh" | "en" {
  return value === "en" ? "en" : "zh";
}

const homepagePromotedSorts = new Set([
  "sortOrder-asc",
  "sortOrder-desc",
  "postId-desc",
  "title-asc",
]);

function normalizeSort(value?: string) {
  return homepagePromotedSorts.has(value ?? "") ? value! : "sortOrder-asc";
}

function languageHref(language: "zh" | "en") {
  return language === "zh"
    ? "/collect/homepage-promoted"
    : "/collect/homepage-promoted?language=en";
}

function getActionErrorMessage(result: { error?: string; message?: unknown }) {
  if (!result.error) return null;
  if (typeof result.message === "string" && result.message.trim()) {
    return `${result.error}：${result.message}`;
  }
  return result.error;
}

async function HomepagePromotedPostContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{
    language?: string;
    query?: string;
    sort?: string;
  }>;
}) {
  const searchParams = await searchParamsPromise;
  const language = normalizeLanguage(searchParams.language);
  const query = searchParams.query?.trim().slice(0, 160) ?? "";
  const sort = normalizeSort(searchParams.sort);
  const [listResult, optionsResult] = await Promise.all([
    getHomepagePromotedPostList(language),
    getPublishedPostOptions(language),
  ]);
  const data = listResult.data ?? [];
  const postOptions = optionsResult.data ?? [];
  const loadErrors = [
    getActionErrorMessage(listResult),
    getActionErrorMessage(optionsResult),
  ].filter((message): message is string => Boolean(message));

  return (
    <AdminPageShell
      badge="首页运营"
      title="首页推荐配置"
      description="这里控制首页右侧“站长推荐”文章的展示顺序，并按中文/英文首页独立配置。"
      actions={
        <div className="flex rounded-md border border-border/70 bg-background p-1">
          {(["zh", "en"] as const).map((item) => (
            <Button
              key={item}
              asChild
              size="sm"
              variant={language === item ? "default" : "ghost"}
            >
              <Link href={languageHref(item)}>
                {item === "zh" ? "中文" : "英文"}
              </Link>
            </Button>
          ))}
        </div>
      }
    >
      <AdminSummaryStrip
        items={[
          {
            label: "推荐位数量",
            value: String(data.length),
            note: language === "en" ? "英文首页条目" : "中文首页条目",
          },
          {
            label: "可选文章",
            value: String((postOptions ?? []).length),
            note: language === "en" ? "最近英文文章" : "最近中文文章",
          },
          {
            label: "工作模式",
            value: "手动排序",
            note: "排序值越小越靠前",
          },
        ]}
      />
      {loadErrors.length > 0 ? (
        <AdminSectionCard
          title="首页推荐数据加载不完整"
          description="页面会保留仍可用的内容；请检查数据库连接、文章语言或后台日志后再操作。"
        >
          <div className="space-y-1">
            {loadErrors.map((message) => (
              <p key={message} className="break-words text-sm text-destructive">
                {message}
              </p>
            ))}
          </div>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard
        title="推荐位管理"
        description="通过文章 ID 和排序值控制首页推荐区展示内容。"
      >
        <HomepagePromotedPostTable
          key={`${language}:${query}:${sort}`}
          data={data}
          postOptions={postOptions ?? []}
          language={language}
          initialQuery={query}
          initialSort={sort}
        />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function HomepagePromotedPostPage(props: {
  searchParams: Promise<{
    language?: string;
    query?: string;
    sort?: string;
  }>;
}) {
  return (
    <Suspense
      fallback={
        <AdminLoading
          badge="首页运营"
          title="正在加载首页推荐"
          description="正在读取推荐位和可选文章。"
        />
      }
    >
      <HomepagePromotedPostContent searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
