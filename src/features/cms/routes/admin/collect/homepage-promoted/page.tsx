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

async function HomepagePromotedPostContent() {
  const [{ data, error }, { data: postOptions }] = await Promise.all([
    getHomepagePromotedPostList(),
    getPublishedPostOptions(),
  ]);

  if (error || !data) {
    return <div>获取首页推荐文章配置失败</div>;
  }

  return (
    <AdminPageShell
      badge="首页运营"
      title="首页推荐配置"
      description="这里控制首页右侧“站长推荐”文章的展示顺序。底层表为 `homepage_promoted_posts`。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "推荐位数量",
            value: String(data.length),
            note: "当前已配置条目",
          },
          {
            label: "可选文章",
            value: String((postOptions ?? []).length),
            note: "最近已发布文章",
          },
          {
            label: "工作模式",
            value: "手动排序",
            note: "sortOrder 越小越靠前",
          },
        ]}
      />
      <AdminSectionCard
        title="推荐位管理"
        description="通过文章 ID 和排序值控制首页推荐区展示内容。"
      >
        <HomepagePromotedPostTable
          data={data}
          postOptions={postOptions ?? []}
        />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function HomepagePromotedPostPage() {
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
      <HomepagePromotedPostContent />
    </Suspense>
  );
}
