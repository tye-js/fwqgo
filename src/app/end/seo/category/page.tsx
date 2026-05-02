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
      badge="SEO / 分类"
      title="分类 SEO 管理"
      description="校对叶子分类的 description 和 keywords，避免分类页在搜索引擎中信息过于单薄。"
    >
      <AdminSectionCard
        title="叶子分类列表"
        description="后续如果要加入编辑功能，这里就是最合适的落点。"
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
