import { redirect } from "next/navigation";

export default async function DraftsPage({
  searchParams,
}: {
  searchParams: Promise<{
    pageNo?: string;
    language?: string;
    query?: string;
    sort?: string;
  }>;
}) {
  const current = await searchParams;
  const params = new URLSearchParams({ status: "draft" });

  if (current.pageNo) params.set("pageNo", current.pageNo);
  if (current.language) params.set("language", current.language);
  if (current.query) params.set("query", current.query.slice(0, 160));
  if (current.sort) params.set("sort", current.sort);

  redirect(`/posts/edit?${params.toString()}`);
}
