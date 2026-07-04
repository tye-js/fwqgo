import { Suspense } from "react";
import Link from "next/link";

import { getDraftPostCount, getDraftPosts } from "@/features/cms/data/post";
import { AdminLoading } from "@/features/cms/components/admin-loading";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { PostList } from "@/features/cms/components/posts-tables";
import { Button } from "@/components/ui/button";

function parsePageNo(value: string | undefined) {
  const parsed = value ? Number.parseInt(value, 10) : 1;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

async function DraftListWrapper({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ pageNo?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const pageNo = parsePageNo(searchParams.pageNo);
  const { data: posts, error } = await getDraftPosts({ pageNo, pageSize: 15 });

  if (error || !posts) {
    return <div>获取草稿列表失败</div>;
  }

  const { data: draftCount } = await getDraftPostCount();
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
            value: String(posts.length),
            note: "可继续人工编辑",
          },
        ]}
      />
      <AdminSectionCard
        title="待编辑草稿"
        description="可以继续编辑标题、封面、slug 和发布状态；点击 slug 进入完整编辑页。"
      >
        <PostList
          posts={posts}
          editBasePath="/posts/edit"
          defaultStatusFilter="draft"
        />
        <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function DraftsPage(props: {
  searchParams: Promise<{ pageNo?: string }>;
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
