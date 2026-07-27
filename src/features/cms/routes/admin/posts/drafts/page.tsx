import { redirect } from "next/navigation";
import { firstSearchParam, type SearchParamValue } from "@fwqgo/core/utils";

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{
    pageNo?: SearchParamValue;
    language?: SearchParamValue;
    query?: SearchParamValue;
    sort?: SearchParamValue;
  }>;
}) {
  const current = await searchParams;
  const params = new URLSearchParams({ status: "draft" });
  const pageNo = firstSearchParam(current.pageNo);
  const language = firstSearchParam(current.language);
  const query = firstSearchParam(current.query);
  const sort = firstSearchParam(current.sort);

  if (pageNo) params.set("pageNo", pageNo);
  if (language) params.set("language", language);
  if (query) params.set("query", query.slice(0, 160));
  if (sort) params.set("sort", sort);

  redirect(`/posts/edit?${params.toString()}`);
}
