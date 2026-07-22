import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Layers3,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { ARTICLE_PROSE_CLASS_NAME } from "@/features/public/components/article-detail";
import {
  getPublishedKnowledgeArticleBySlug,
  getRelatedKnowledgeArticles,
} from "@/features/public/data/knowledge";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import { jsonLdScriptContent, normalizeDecodedSlug } from "@fwqgo/core/utils";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}

function splitKeywords(value: string | null) {
  return (value ?? "")
    .split(/[,，、;；\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const slug = normalizeDecodedSlug(params.slug);
  if (!slug) return {};
  const article = await getPublishedKnowledgeArticleBySlug(slug);
  if (!article) return {};

  return {
    title: article.title,
    description: article.summary ?? article.content.slice(0, 150),
    keywords: splitKeywords(article.keywords),
    alternates: {
      canonical: `/knowledge/${encodeURIComponent(article.slug)}`,
    },
  };
}

async function KnowledgeArticleContent(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const slug = normalizeDecodedSlug(params.slug);
  if (!slug) notFound();
  const article = await getPublishedKnowledgeArticleBySlug(slug);
  if (!article) notFound();

  const [related, contentHtml] = await Promise.all([
    getRelatedKnowledgeArticles({
      articleId: article.id,
      categoryId: article.categoryId,
    }),
    Promise.resolve(renderArticleContentHtml(article.content)),
  ]);
  const updatedAt =
    article.updatedAt ?? article.publishedAt ?? article.createdAt;
  const articleUrl = `${getSiteUrl()}/knowledge/${encodeURIComponent(article.slug)}`;
  const keywords = splitKeywords(article.keywords);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: article.title,
      description: article.summary,
      datePublished: article.publishedAt ?? article.createdAt,
      dateModified: updatedAt,
      about: keywords,
      publisher: { "@type": "Organization", name: "服务器go" },
      mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "首页", item: getSiteUrl() },
        {
          "@type": "ListItem",
          position: 2,
          name: "服务器知识库",
          item: `${getSiteUrl()}/knowledge`,
        },
        {
          "@type": "ListItem",
          position: 3,
          name: article.title,
          item: articleUrl,
        },
      ],
    },
  ];

  return (
    <main className="flex-1">
      <article className="container mx-auto max-w-5xl px-4 py-7 md:py-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScriptContent(jsonLd) }}
        />
        <nav aria-label="面包屑" className="mb-5">
          <Link
            href="/knowledge"
            className="inline-flex min-h-10 items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" />
            返回服务器知识库
          </Link>
        </nav>

        <header className="border-b border-border/70 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              <Layers3 className="mr-1 size-3.5" />
              {article.categoryName}
            </Badge>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              更新于 {formatDate(updatedAt)}
            </span>
          </div>
          <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-normal md:text-4xl">
            {article.title}
          </h1>
          {article.summary ? (
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              {article.summary}
            </p>
          ) : null}
        </header>

        <div
          className={`${ARTICLE_PROSE_CLASS_NAME} mx-auto mt-8 max-w-3xl`}
          dangerouslySetInnerHTML={{ __html: contentHtml }}
        />

        {keywords.length > 0 ? (
          <section className="mx-auto mt-10 max-w-3xl border-t border-border/70 pt-5">
            <h2 className="text-sm font-semibold">相关主题</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <Link
                  key={keyword}
                  href={`/knowledge?q=${encodeURIComponent(keyword)}`}
                  className="inline-flex min-h-9 items-center rounded-md border border-border/70 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {keyword}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {related.length > 0 ? (
          <section className="mx-auto mt-10 max-w-3xl border-t border-border/70 pt-6">
            <div className="flex items-center gap-2">
              <BookOpen className="size-4 text-primary" />
              <h2 className="text-lg font-semibold">同分类知识</h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {related.map((item) => (
                <Link
                  key={item.id}
                  href={`/knowledge/${encodeURIComponent(item.slug)}`}
                  className="group rounded-md border border-border/70 p-4 transition-colors hover:border-primary/40"
                >
                  <h3 className="text-sm font-semibold leading-6 group-hover:text-primary">
                    {item.title}
                  </h3>
                  {item.summary ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {item.summary}
                    </p>
                  ) : null}
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
                    继续阅读
                    <ArrowRight className="size-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}

export default function KnowledgeArticlePage(props: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Suspense
        fallback={
          <main className="container mx-auto flex flex-1 items-center px-4 py-12">
            <div className="w-full rounded-md border border-border/70 p-6 text-sm text-muted-foreground">
              正在加载知识详情...
            </div>
          </main>
        }
      >
        <KnowledgeArticleContent params={props.params} />
      </Suspense>
      <Footer />
    </div>
  );
}
