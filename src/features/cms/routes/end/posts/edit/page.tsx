import { Suspense } from "react";
import { getPosts, getPostCount } from "@/features/cms/data/post";
import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/features/cms/components/admin-page-shell";
import { PaginationComponent } from "@/features/shared/components/pagination";
import { PostList } from "@/features/cms/components/posts-tables";
import { Button } from "@/components/ui/button";
import Link from "next/link";

async function PostListWrapper({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ pageNo?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const pageNo = searchParams.pageNo ? parseInt(searchParams.pageNo) : 1;
  const { data: posts, error } = await getPosts({ pageNo, pageSize: 15 });

  if (error || !posts) {
    return <div>获取文章列表失败</div>;
  }

  const { data: postCount } = await getPostCount();
  const totalPage = Math.ceil((postCount ?? 0) / 15);

  return (
    <AdminPageShell
      badge="文章管理"
      title="文章列表与快速维护"
      description="在这里集中查看、编辑、删除和校对文章基础信息。列表区沿用统一的后台视觉风格，更适合高频运营操作。"
      actions={
        <Button asChild>
          <Link href="/end/posts/create">新建文章</Link>
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
        <PostList posts={posts} />
        <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default function EditPage(
  props: {
    searchParams: Promise<{ pageNo?: string }>;
  }
) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PostListWrapper searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
