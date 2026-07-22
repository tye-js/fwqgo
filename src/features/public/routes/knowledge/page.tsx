import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight, BookOpen, Layers3, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginationComponent } from "@/features/shared/components/pagination";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import {
  getPublicKnowledgeCategories,
  listPublishedKnowledgeArticles,
} from "@/features/public/data/knowledge";
import { parsePositiveInt } from "@fwqgo/core/utils";

export const metadata: Metadata = {
  title: "服务器知识库：配置、线路、机房与 IP 基础知识",
  description:
    "查询 VPS、云服务器、独立服务器配置，CN2 GIA、CMI、BGP 等线路，以及机房、IP、网络和运维基础知识。",
};

function splitKeywords(value: string | null) {
  return (value ?? "")
    .split(/[,，、;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function formatKnowledgeDate(value: Date | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function knowledgeHref(input: {
  query: string;
  category: string;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.category) params.set("category", input.category);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const search = params.toString();
  return search ? `/knowledge?${search}` : "/knowledge";
}

async function KnowledgeIndexContent(props: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  await connection();
  const params = await props.searchParams;
  const query = params.q?.trim().slice(0, 120) ?? "";
  const category = params.category?.trim().slice(0, 160) ?? "";
  const page = parsePositiveInt(params.page) ?? 1;
  const [categories, result] = await Promise.all([
    getPublicKnowledgeCategories(),
    listPublishedKnowledgeArticles({ query, categorySlug: category, page }),
  ]);
  const selectedCategory = categories.find((item) => item.slug === category);

  return (
    <main className="flex-1">
      <section className="border-b border-border/60 bg-muted/20">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="max-w-4xl">
            <Badge className="bg-primary text-primary-foreground">
              <BookOpen className="mr-1 size-3.5" />
              服务器知识库
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal md:text-4xl">
              服务器配置、线路与网络知识
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
              查询
              VPS、云服务器、独立服务器的配置含义，了解线路、机房、IP、网络与常见应用场景。
            </p>
            <form
              action="/knowledge"
              className="mt-5 flex flex-col gap-2 sm:flex-row"
            >
              {category ? (
                <input type="hidden" name="category" value={category} />
              ) : null}
              <label htmlFor="knowledge-search" className="sr-only">
                搜索知识库
              </label>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="knowledge-search"
                  type="search"
                  name="q"
                  defaultValue={query}
                  className="min-h-11 w-full rounded-md border border-border/70 bg-background pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
                  placeholder="搜索 CN2 GIA、BGP、原生 IP、CPU、内存等"
                />
              </div>
              <Button type="submit" className="min-h-11">
                搜索
                <ArrowRight className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-10">
        <nav aria-label="知识分类" className="flex flex-wrap gap-2">
          <Link
            href={knowledgeHref({ query, category: "" })}
            className={`inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium transition-colors ${
              !category
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            全部知识
            <span className="ml-2 text-xs opacity-75">
              {categories.reduce((total, item) => total + item.articleCount, 0)}
            </span>
          </Link>
          {categories.map((item) => (
            <Link
              key={item.id}
              href={knowledgeHref({ query, category: item.slug })}
              className={`inline-flex min-h-10 items-center rounded-md border px-3 text-sm font-medium transition-colors ${
                category === item.slug
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {item.name}
              <span className="ml-2 text-xs opacity-75">
                {item.articleCount}
              </span>
            </Link>
          ))}
        </nav>

        <div className="mt-7 flex flex-col gap-2 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-normal">
              {selectedCategory?.name ??
                (query ? `“${query}”的查询结果` : "全部知识")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              共 {result.total} 条内容
              {selectedCategory?.description
                ? ` · ${selectedCategory.description}`
                : ""}
            </p>
          </div>
          {(query || category) && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/knowledge">清除筛选</Link>
            </Button>
          )}
        </div>

        {result.items.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.items.map((article) => {
              const keywords = splitKeywords(article.keywords);
              return (
                <article
                  key={article.id}
                  className="flex min-h-56 flex-col rounded-md border border-border/70 bg-background p-5 shadow-sm transition-colors hover:border-primary/35"
                >
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                      <Layers3 className="size-3.5" />
                      {article.categoryName}
                    </span>
                    <time
                      dateTime={(
                        article.updatedAt ?? article.createdAt
                      ).toISOString()}
                    >
                      {formatKnowledgeDate(
                        article.updatedAt ?? article.createdAt,
                      )}
                    </time>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold leading-7 tracking-normal">
                    <Link
                      href={`/knowledge/${encodeURIComponent(article.slug)}`}
                      className="rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {article.title}
                    </Link>
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {article.summary ??
                      "查看这条服务器知识的完整说明、适用范围和注意事项。"}
                  </p>
                  <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
                    <div className="flex flex-wrap gap-1.5">
                      {keywords.map((keyword) => (
                        <span
                          key={keyword}
                          className="rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                    <Link
                      href={`/knowledge/${encodeURIComponent(article.slug)}`}
                      className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      查看
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-md border border-dashed border-border/70 bg-muted/20 px-5 py-14 text-center">
            <BookOpen className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">没有找到匹配的知识条目</p>
            <p className="mt-2 text-sm text-muted-foreground">
              可以缩短关键词，或切换到其他知识分类。
            </p>
          </div>
        )}

        <div className="mt-8">
          <PaginationComponent
            pageNo={result.page}
            totalPage={result.totalPages}
            queryParam="page"
          />
        </div>
      </section>
    </main>
  );
}

export default function KnowledgeIndexPage(props: {
  searchParams: Promise<{ q?: string; category?: string; page?: string }>;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Suspense
        fallback={
          <main className="container mx-auto flex flex-1 items-center px-4 py-12">
            <div className="w-full rounded-md border border-border/70 p-6 text-sm text-muted-foreground">
              正在加载知识库...
            </div>
          </main>
        }
      >
        <KnowledgeIndexContent searchParams={props.searchParams} />
      </Suspense>
      <Footer />
    </div>
  );
}
