import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { CreatePostWorkbench } from "@/features/cms/components/create-post-workbench";
import { getLeafCategories } from "@/features/shared/data/category";

export default async function CreatePostPage() {
  const { data: categories, error } = await getLeafCategories();

  return (
    <AdminPageShell
      badge="内容创作"
      title="新建文章"
    >
      {error ? (
        <AdminSectionCard>
          <p className="text-sm text-destructive">获取分类失败：{error}</p>
        </AdminSectionCard>
      ) : (
        <CreatePostWorkbench categories={categories ?? []} />
      )}
    </AdminPageShell>
  );
}
