import { getLeafCategoriesAllData } from "@/app/_actions/category";
import { AdminPageShell, AdminSectionCard } from "@/app/_components/admin-page-shell";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
export default async function Page() {
  const { data, error } = await getLeafCategoriesAllData();
  if (error) {
    return <div>获取叶子分类列表失败</div>;
  }

  return (
    <AdminPageShell
      badge="SEO"
      title="SEO 概览"
      description="集中查看当前分类与标签的 SEO 基础数据，方便继续补全和校对。"
    >
      <AdminSectionCard
        title="分类 SEO 速览"
        description="当前列出叶子分类的 slug、description 与 keywords。"
      >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Keywords</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data!.map((category) => (
            <TableRow key={category.id}>
              <TableCell>{category.id}</TableCell>
              <TableCell>{category.name}</TableCell>
              <TableCell>{category.slug}</TableCell>
              <TableCell>{category.description}</TableCell>
              <TableCell>{category.keywords}</TableCell>
              <TableCell>
                <Button variant="outline" size="sm">
                  编辑
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
