import { Suspense } from "react";
import { connection } from "next/server";
import { getAdminTagCount, getAdminTagList } from "@/app/_actions/tag";
import { AdminPageShell, AdminSectionCard } from "@/app/_components/admin-page-shell";
import { PaginationComponent } from "@/app/_components/pagination";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

async function TagListWrapper({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<{ pageNo?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  const pageNo = searchParams.pageNo ? parseInt(searchParams.pageNo) : 1;
  const { data } = await getAdminTagList({ page: pageNo, pageSize: 20 });
  const { data: tagCount } = await getAdminTagCount();

  if (!data) {
    return <div>获取标签列表失败</div>;
  }

  const totalPage = Math.ceil((tagCount ?? 0) / 20);

  return (
    <AdminPageShell
      badge="SEO / 标签"
      title="标签 SEO 管理"
      description="查看标签库的 slug、description 和 keywords，方便持续优化聚合页覆盖面。"
    >
      <AdminSectionCard
        title="标签列表"
        description="当前按分页展示标签，后续可以继续加搜索和批量编辑。"
      >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Keywords</TableHead>
            <TableHead className="text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((tag) => (
            <TableRow key={tag.id}>
              <TableCell>{tag.id}</TableCell>
              <TableCell>{tag.name}</TableCell>
              <TableCell>{tag.slug}</TableCell>
              <TableCell>{tag.description}</TableCell>
              <TableCell>{tag.keywords}</TableCell>
              <TableCell className="flex justify-center gap-2">
                <Button variant="outline" size="sm">
                  编辑
                </Button>
                <Button variant="destructive" size="sm">
                  删除
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationComponent pageNo={pageNo} totalPage={totalPage} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}

export default async function Page(
  props: {
    searchParams: Promise<{ pageNo?: string }>;
  }
) {
  await connection();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TagListWrapper searchParamsPromise={props.searchParams} />
    </Suspense>
  );
}
