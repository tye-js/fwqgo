import { AiRewriteTasksPageContent } from "@/features/cms/routes/admin/ai-rewrite/tasks/page";

type AiRewriteTaskSearchParams = {
  pageNo?: string;
  status?: string;
  sourceType?: string;
  language?: string;
  query?: string;
};

export default async function AiTasksPage(props: {
  searchParams: Promise<AiRewriteTaskSearchParams>;
}) {
  return (
    <AiRewriteTasksPageContent
      variant="task-center"
      searchParamsPromise={props.searchParams}
    />
  );
}
