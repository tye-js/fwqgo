import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArrowRight, BookOpen, Layers3, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import {
  getPublicKnowledgeCategories,
  listPublishedKnowledgeArticles,
  type PublicKnowledgeLanguage,
} from "@/features/public/data/knowledge";
import { PaginationComponent } from "@/features/shared/components/pagination";
import {
  firstSearchParam,
  parsePositiveInt,
  type SearchParamValue,
} from "@fwqgo/core/utils";

export type KnowledgeSearchParams = {
  q?: SearchParamValue;
  category?: SearchParamValue;
  page?: SearchParamValue;
};

const copy = {
  zh: {
    metadataTitle: "服务器知识库：配置、线路、机房与 IP 基础知识",
    metadataDescription:
      "查询 VPS、云服务器、独立服务器配置，CN2 GIA、CMI、BGP 等线路，以及机房、IP、网络和运维基础知识。",
    badge: "服务器知识库",
    heading: "服务器配置、线路与网络知识",
    introduction:
      "查询 VPS、云服务器、独立服务器的配置含义，了解线路、机房、IP、网络与常见应用场景。",
    searchLabel: "搜索知识库",
    searchPlaceholder: "搜索 CN2 GIA、BGP、原生 IP、CPU、内存等",
    searchButton: "搜索",
    categoryNav: "知识分类",
    allKnowledge: "全部知识",
    queryResult: (query: string) => `“${query}”的查询结果`,
    total: (total: number) => `共 ${total} 条内容`,
    clear: "清除筛选",
    fallbackSummary: "查看这条服务器知识的完整说明、适用范围和注意事项。",
    view: "查看",
    emptyTitle: "没有找到匹配的知识条目",
    emptyDescription: "可以缩短关键词，或切换到其他知识分类。",
    loading: "正在加载知识库...",
  },
  en: {
    metadataTitle: "Server Knowledge Base: VPS, Networks, Data Centers, and IP",
    metadataDescription:
      "Learn how to choose and operate VPS, cloud, and dedicated servers, understand network routes and regions, and troubleshoot common IP, DNS, and deployment issues.",
    badge: "Server Knowledge Base",
    heading: "Server configuration, routing, and network knowledge",
    introduction:
      "Learn how server resources, network routes, regions, IP addressing, and common operations affect real deployments.",
    searchLabel: "Search the knowledge base",
    searchPlaceholder: "Search BGP, IPv6, DNS, CPU, memory, or MTR",
    searchButton: "Search",
    categoryNav: "Knowledge categories",
    allKnowledge: "All knowledge",
    queryResult: (query: string) => `Results for “${query}”`,
    total: (total: number) => `${total} article${total === 1 ? "" : "s"}`,
    clear: "Clear filters",
    fallbackSummary:
      "Read the full explanation, scope, verification steps, and operational limits.",
    view: "Read",
    emptyTitle: "No matching knowledge articles",
    emptyDescription: "Try a shorter query or choose another category.",
    loading: "Loading the knowledge base...",
  },
} as const;

function splitKeywords(value: string | null) {
  return (value ?? "")
    .split(/[,，、;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function formatKnowledgeDate(value: Date, language: PublicKnowledgeLanguage) {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function knowledgeHref(
  language: PublicKnowledgeLanguage,
  input: { query: string; category: string; page?: number },
) {
  const params = new URLSearchParams();
  if (input.query) params.set("q", input.query);
  if (input.category) params.set("category", input.category);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  const pathname = language === "en" ? "/en/knowledge" : "/knowledge";
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

function hasIndexParameters(params: KnowledgeSearchParams) {
  return [params.q, params.category, params.page].some(
    (value) => value !== undefined,
  );
}

export async function buildKnowledgeIndexMetadata(
  language: PublicKnowledgeLanguage,
  searchParams: Promise<KnowledgeSearchParams>,
): Promise<Metadata> {
  const params = await searchParams;
  const languageCopy = copy[language];
  const canonical = language === "en" ? "/en/knowledge" : "/knowledge";
  const parameterized = hasIndexParameters(params);

  return {
    title: languageCopy.metadataTitle,
    description: languageCopy.metadataDescription,
    alternates: parameterized
      ? { canonical }
      : {
          canonical,
          languages: {
            "zh-CN": "/knowledge",
            en: "/en/knowledge",
            "x-default": "/knowledge",
          },
        },
    robots: parameterized ? { index: false, follow: true } : undefined,
  };
}

function localizeCategories(
  categories: Awaited<ReturnType<typeof getPublicKnowledgeCategories>>,
  language: PublicKnowledgeLanguage,
) {
  if (language === "zh") {
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      articleCount: category.zhArticleCount,
    }));
  }

  return categories.flatMap((category) => {
    const name = category.enName?.trim();
    const slug = category.enSlug?.trim();
    const description = category.enDescription?.trim();
    return name && slug && description
      ? [
          {
            id: category.id,
            name,
            slug,
            description,
            articleCount: category.enArticleCount,
          },
        ]
      : [];
  });
}

async function KnowledgeIndexContent(props: {
  language: PublicKnowledgeLanguage;
  searchParams: Promise<KnowledgeSearchParams>;
}) {
  await connection();
  const params = await props.searchParams;
  const query = firstSearchParam(params.q)?.trim().slice(0, 120) ?? "";
  const category =
    firstSearchParam(params.category)?.trim().slice(0, 160) ?? "";
  const page = parsePositiveInt(params.page) ?? 1;
  const [categoryRows, result] = await Promise.all([
    getPublicKnowledgeCategories(),
    listPublishedKnowledgeArticles({
      language: props.language,
      query,
      categorySlug: category,
      page,
    }),
  ]);
  if (result.page !== page) notFound();
  const categories = localizeCategories(categoryRows, props.language);
  const selectedCategory = categories.find((item) => item.slug === category);
  const languageCopy = copy[props.language];
  const indexHref = props.language === "en" ? "/en/knowledge" : "/knowledge";

  return (
    <main className="flex-1">
      <section className="border-b border-border/60 bg-muted/20">
        <div className="container mx-auto px-4 py-8 md:py-10">
          <div className="max-w-4xl">
            <Badge className="bg-primary text-primary-foreground">
              <BookOpen className="mr-1 size-3.5" />
              {languageCopy.badge}
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal md:text-4xl">
              {languageCopy.heading}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
              {languageCopy.introduction}
            </p>
            <form
              action={indexHref}
              className="mt-5 flex flex-col gap-2 sm:flex-row"
            >
              {category ? (
                <input type="hidden" name="category" value={category} />
              ) : null}
              <label htmlFor="knowledge-search" className="sr-only">
                {languageCopy.searchLabel}
              </label>
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="knowledge-search"
                  type="search"
                  name="q"
                  defaultValue={query}
                  className="min-h-11 w-full rounded-md border border-border/70 bg-background pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
                  placeholder={languageCopy.searchPlaceholder}
                />
              </div>
              <Button type="submit" className="min-h-11">
                {languageCopy.searchButton}
                <ArrowRight className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-8 md:py-10">
        <nav
          aria-label={languageCopy.categoryNav}
          className="flex flex-wrap gap-2"
        >
          <Link
            href={knowledgeHref(props.language, { query, category: "" })}
            className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium transition-colors ${
              !category
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {languageCopy.allKnowledge}
            <span className="ml-2 text-xs opacity-75">
              {categories.reduce((total, item) => total + item.articleCount, 0)}
            </span>
          </Link>
          {categories.map((item) => (
            <Link
              key={item.id}
              href={knowledgeHref(props.language, {
                query,
                category: item.slug,
              })}
              className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium transition-colors ${
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
                (query
                  ? languageCopy.queryResult(query)
                  : languageCopy.allKnowledge)}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {languageCopy.total(result.total)}
              {selectedCategory?.description
                ? ` · ${selectedCategory.description}`
                : ""}
            </p>
          </div>
          {query || category ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={indexHref}>{languageCopy.clear}</Link>
            </Button>
          ) : null}
        </div>

        {result.items.length > 0 ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.items.map((article) => {
              const keywords = splitKeywords(article.keywords);
              const categoryName =
                props.language === "en"
                  ? article.categoryEnName
                  : article.categoryName;
              const articleHref = `${indexHref}/${encodeURIComponent(article.slug)}`;
              return (
                <article
                  key={article.id}
                  className="flex min-h-56 flex-col rounded-md border border-border/70 bg-background p-5 shadow-sm transition-colors hover:border-primary/35"
                >
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5 font-medium text-primary">
                      <Layers3 className="size-3.5" />
                      {categoryName}
                    </span>
                    <time dateTime={article.contentUpdatedAt.toISOString()}>
                      {formatKnowledgeDate(
                        article.contentUpdatedAt,
                        props.language,
                      )}
                    </time>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold leading-7 tracking-normal">
                    <Link
                      href={articleHref}
                      className="rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {article.title}
                    </Link>
                  </h3>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {article.summary ?? languageCopy.fallbackSummary}
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
                      href={articleHref}
                      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      {languageCopy.view}
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
            <p className="mt-4 text-sm font-medium">
              {languageCopy.emptyTitle}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {languageCopy.emptyDescription}
            </p>
          </div>
        )}

        <div className="mt-8">
          <PaginationComponent
            pageNo={result.page}
            totalPage={result.totalPages}
            queryParam="page"
            language={props.language}
          />
        </div>
      </section>
    </main>
  );
}

export function KnowledgeIndexPage(props: {
  language: PublicKnowledgeLanguage;
  searchParams: Promise<KnowledgeSearchParams>;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language={props.language} />
      <Suspense
        fallback={
          <main className="container mx-auto flex flex-1 items-center px-4 py-12">
            <div className="w-full rounded-md border border-border/70 p-6 text-sm text-muted-foreground">
              {copy[props.language].loading}
            </div>
          </main>
        }
      >
        <KnowledgeIndexContent
          language={props.language}
          searchParams={props.searchParams}
        />
      </Suspense>
      <Footer language={props.language} />
    </div>
  );
}

export function generateMetadata(props: {
  searchParams: Promise<KnowledgeSearchParams>;
}) {
  return buildKnowledgeIndexMetadata("zh", props.searchParams);
}

export default function ChineseKnowledgeIndexPage(props: {
  searchParams: Promise<KnowledgeSearchParams>;
}) {
  return <KnowledgeIndexPage language="zh" searchParams={props.searchParams} />;
}
