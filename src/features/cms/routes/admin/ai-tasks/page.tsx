import { AiRewriteTasksPageContent } from "@/features/cms/routes/admin/ai-rewrite/tasks/page";
import type { SearchParamValue } from "@fwqgo/core/utils";

type AiRewriteTaskSearchParams = {
  pageNo?: SearchParamValue;
  status?: SearchParamValue;
  sourceType?: SearchParamValue;
  language?: SearchParamValue;
  query?: SearchParamValue;
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
