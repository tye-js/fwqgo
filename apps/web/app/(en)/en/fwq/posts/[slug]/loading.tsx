import { ArticlePageSkeleton } from "@/features/public/components/article-detail";

export default function Loading() {
  return (
    <main className="flex-1">
      <ArticlePageSkeleton variant="full" />
    </main>
  );
}
