import { AiRewriteTaskDetailPageContent } from "@/features/cms/routes/end/ai-rewrite/tasks/[id]/page";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AiTaskDetailPage({ params }: PageProps) {
  return (
    <AiRewriteTaskDetailPageContent
      params={params}
      basePath="/end/ai-tasks"
    />
  );
}
