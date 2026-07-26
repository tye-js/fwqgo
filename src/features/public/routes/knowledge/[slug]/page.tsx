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
import { ARTICLE_PROSE_CLASS_NAME } from "@/features/public/components/article-detail";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import {
  getPublishedKnowledgeArticleBySlug,
  getRelatedKnowledgeArticles,
  type PublicKnowledgeLanguage,
} from "@/features/public/data/knowledge";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import { jsonLdScriptContent, normalizeDecodedSlug } from "@fwqgo/core/utils";

const copy = {
  zh: {
    home: "首页",
    knowledge: "服务器知识库",
    back: "返回服务器知识库",
    updated: "更新于",
    topics: "相关主题",
    related: "同分类知识",
    continueReading: "继续阅读",
    breadcrumb: "面包屑",
    loading: "正在加载知识详情...",
    inLanguage: "zh-CN",
    locale: "zh_CN",
    publisher: "服务器go",
  },
  en: {
    home: "Home",
    knowledge: "Server Knowledge Base",
    back: "Back to the Server Knowledge Base",
    updated: "Updated",
    topics: "Related topics",
    related: "More in this category",
    continueReading: "Continue reading",
    breadcrumb: "Breadcrumb",
    loading: "Loading this knowledge article...",
    inLanguage: "en",
    locale: "en_US",
    publisher: "fwqgo",
  },
} as const;

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

function formatDate(value: Date, language: PublicKnowledgeLanguage) {
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "zh-CN", {
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

function articlePath(language: PublicKnowledgeLanguage, slug: string) {
  return `${language === "en" ? "/en" : ""}/knowledge/${encodeURIComponent(slug)}`;
}

function indexPath(language: PublicKnowledgeLanguage) {
  return language === "en" ? "/en/knowledge" : "/knowledge";
}

function knowledgeAlternates(
  language: PublicKnowledgeLanguage,
  slug: string,
  pairedSlug: string | null,
) {
  const canonical = articlePath(language, slug);
  if (!pairedSlug) return { canonical };
  const zhPath = language === "zh" ? canonical : articlePath("zh", pairedSlug);
  const enPath = language === "en" ? canonical : articlePath("en", pairedSlug);
  return {
    canonical,
    languages: {
      "zh-CN": zhPath,
      en: enPath,
      "x-default": zhPath,
    },
  };
}

export async function buildKnowledgeArticleMetadata(
  language: PublicKnowledgeLanguage,
  paramsPromise: Promise<{ slug: string }>,
): Promise<Metadata> {
  const params = await paramsPromise;
  const slug = normalizeDecodedSlug(params.slug);
  if (!slug) return {};
  const article = await getPublishedKnowledgeArticleBySlug(slug, language);
  if (!article) return {};

  const description = article.summary ?? article.content.slice(0, 150);
  const canonical = articlePath(language, article.slug);
  return {
    title: article.title,
    description,
    keywords: splitKeywords(article.keywords),
    alternates: knowledgeAlternates(
      language,
      article.slug,
      article.pairedArticle?.slug ?? null,
    ),
    openGraph: {
      type: "article",
      title: article.title,
      description,
      url: canonical,
      locale: copy[language].locale,
      alternateLocale: article.pairedArticle
        ? [language === "en" ? "zh_CN" : "en_US"]
        : undefined,
      publishedTime: (article.publishedAt ?? article.createdAt).toISOString(),
      modifiedTime: article.contentUpdatedAt.toISOString(),
    },
    twitter: {
      card: "summary",
      title: article.title,
      description,
    },
  };
}

async function KnowledgeArticleContent(props: {
  language: PublicKnowledgeLanguage;
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const slug = normalizeDecodedSlug(params.slug);
  if (!slug) notFound();
  const article = await getPublishedKnowledgeArticleBySlug(
    slug,
    props.language,
  );
  if (!article) notFound();
  if (
    props.language === "en" &&
    (!article.categoryEnName?.trim() || !article.categoryEnSlug?.trim())
  ) {
    notFound();
  }

  const [related, contentHtml] = await Promise.all([
    getRelatedKnowledgeArticles({
      language: props.language,
      articleId: article.id,
      categoryId: article.categoryId,
    }),
    Promise.resolve(renderArticleContentHtml(article.content)),
  ]);
  const languageCopy = copy[props.language];
  const languageIndexPath = indexPath(props.language);
  const currentArticlePath = articlePath(props.language, article.slug);
  const articleUrl = `${getSiteUrl()}${currentArticlePath}`;
  const keywords = splitKeywords(article.keywords);
  const categoryName =
    props.language === "en" ? article.categoryEnName! : article.categoryName;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: article.title,
      description: article.summary,
      inLanguage: languageCopy.inLanguage,
      datePublished: article.publishedAt ?? article.createdAt,
      dateModified: article.contentUpdatedAt,
      about: keywords,
      publisher: { "@type": "Organization", name: languageCopy.publisher },
      mainEntityOfPage: { "@type": "WebPage", "@id": articleUrl },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: languageCopy.home,
          item: `${getSiteUrl()}${props.language === "en" ? "/en" : ""}`,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: languageCopy.knowledge,
          item: `${getSiteUrl()}${languageIndexPath}`,
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
        <nav aria-label={languageCopy.breadcrumb} className="mb-5">
          <Link
            href={languageIndexPath}
            className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" />
            {languageCopy.back}
          </Link>
        </nav>

        <header className="border-b border-border/70 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              <Layers3 className="mr-1 size-3.5" />
              {categoryName}
            </Badge>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              {languageCopy.updated}{" "}
              {formatDate(article.contentUpdatedAt, props.language)}
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
            <h2 className="text-sm font-semibold">{languageCopy.topics}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <Link
                  key={keyword}
                  href={`${languageIndexPath}?q=${encodeURIComponent(keyword)}`}
                  className="inline-flex min-h-11 items-center rounded-md border border-border/70 px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
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
              <h2 className="text-lg font-semibold">{languageCopy.related}</h2>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {related.map((item) => (
                <Link
                  key={item.id}
                  href={articlePath(props.language, item.slug)}
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
                  <span className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary">
                    {languageCopy.continueReading}
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

export function KnowledgeArticlePage(props: {
  language: PublicKnowledgeLanguage;
  params: Promise<{ slug: string }>;
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
        <KnowledgeArticleContent
          language={props.language}
          params={props.params}
        />
      </Suspense>
      <Footer language={props.language} />
    </div>
  );
}

export function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  return buildKnowledgeArticleMetadata("zh", props.params);
}

export default function ChineseKnowledgeArticlePage(props: {
  params: Promise<{ slug: string }>;
}) {
  return <KnowledgeArticlePage language="zh" params={props.params} />;
}
