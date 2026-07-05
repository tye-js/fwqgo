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

function languageHref(language: "zh" | "en") {
  return language === "zh"
    ? "/collect/homepage-promoted"
    : "/collect/homepage-promoted?language=en";
}

async function HomepagePromotedPostContent({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ language?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const language = normalizeLanguage(searchParams.language);
  const [{ data, error }, { data: postOptions }] = await Promise.all([
    getHomepagePromotedPostList(language),
    getPublishedPostOptions(language),
  ]);

  if (error || !data) {
    return <div>获取首页推荐文章配置失败</div>;
  }

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
      <AdminSectionCard
        title="推荐位管理"
        description="通过文章 ID 和排序值控制首页推荐区展示内容。"
      >
        <HomepagePromotedPostTable
          key={language}
          data={data}
          postOptions={postOptions ?? []}
          language={language}
        />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function HomepagePromotedPostPage(props: {
  searchParams: Promise<{ language?: string }>;
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
