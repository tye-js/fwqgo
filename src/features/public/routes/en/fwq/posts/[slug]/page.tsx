import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, Clock, Tags } from "lucide-react";

import { getEnglishPostWithTagsBySlug } from "@/features/public/data/post";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { ArticleShareActions } from "@/features/public/components/article-share-actions";
import {
  getOptimizedImageSrc,
  isRenderableImageSrc,
} from "@fwqgo/core/image-src";
import { renderArticleContentHtml } from "@fwqgo/core/content";
import { decodeSlug, formatDate } from "@fwqgo/core/utils";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const decodedSlug = decodeSlug(slug);
  const { data } = await getEnglishPostWithTagsBySlug(decodedSlug);
  const post = data?.post;
  const canonicalSlug = post?.enSlug ?? decodedSlug;
  const canonicalUrl = `${getSiteUrl()}/en/fwq/posts/${encodeURIComponent(canonicalSlug)}`;
  const chineseUrl = post?.chineseSlug
    ? `${getSiteUrl()}/fwq/posts/${encodeURIComponent(post.chineseSlug)}`
    : undefined;
  const readableTitle = decodedSlug.replace(/[-_]+/g, " ");
  const title = post?.title ?? readableTitle;
  const description =
    post?.description ?? `${readableTitle} server and VPS deal article.`;
  const image = post?.imgUrl
    ? new URL(post.imgUrl, getSiteUrl()).toString()
    : undefined;

  return {
    title: `${title} - fwqgo`,
    description,
    keywords: post?.keywords ?? readableTitle,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        ...(chineseUrl ? { "zh-CN": chineseUrl } : {}),
        en: canonicalUrl,
        "x-default": chineseUrl ?? canonicalUrl,
      },
    },
    openGraph: {
      type: "article",
      title: `${title} - fwqgo`,
      description,
      url: canonicalUrl,
      siteName: "fwqgo",
      images: image ? [{ url: image, alt: title }] : undefined,
    },
  };
}

async function EnglishPostContent({ params }: PageProps) {
  await connection();

  const { slug } = await params;
  const decodedSlug = decodeSlug(slug);
  const { data, error } = await getEnglishPostWithTagsBySlug(decodedSlug);

  if (error || !data?.post) {
    notFound();
  }

  const post = data.post;
  if (!post.title || !post.content) {
    notFound();
  }
  const articleUrl = `${getSiteUrl()}/en/fwq/posts/${decodedSlug}`;
  const blogPostingJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    image: post.imgUrl
      ? new URL(post.imgUrl, getSiteUrl()).toString()
      : undefined,
    description: post.description,
    inLanguage: "en",
    datePublished: post.createdAt,
    dateModified: post.updatedAt ?? post.createdAt,
    author: {
      "@type": "Organization",
      name: "fwqgo",
    },
    publisher: {
      "@type": "Organization",
      name: "fwqgo",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl,
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: getSiteUrl(),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "English articles",
        item: articleUrl,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: articleUrl,
      },
    ],
  };

  return (
    <main className="flex-1">
      <article className="container mx-auto max-w-4xl px-4 py-6 md:py-10">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([blogPostingJsonLd, breadcrumbJsonLd]),
          }}
        />
        {post.chineseSlug ? (
          <Link
            href={`/fwq/posts/${post.chineseSlug}`}
            prefetch
            className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
          >
            <ArrowLeft className="size-4" />
            Chinese version
          </Link>
        ) : null}

        <header className="mt-6 border-b border-border/70 pb-6">
          <h1 className="font-editorial text-3xl font-semibold leading-tight text-foreground md:text-5xl">
            {post.title}
          </h1>
          {post.description ? (
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {post.description}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Clock className="size-4" />
              {formatDate(post.createdAt)}
            </span>
            <ArticleShareActions title={post.title} url={articleUrl} />
          </div>
        </header>

        {isRenderableImageSrc(post.imgUrl) ? (
          <div className="relative mt-6 aspect-[16/9] overflow-hidden rounded-lg border border-border/70 bg-muted/20 md:aspect-[21/9]">
            <Image
              src={getOptimizedImageSrc(post.imgUrl)}
              alt={post.title}
              width={1440}
              height={840}
              sizes="(max-width: 768px) 100vw, 960px"
              className="h-full w-full object-cover"
              priority
            />
          </div>
        ) : null}

        <div
          className="article-prose font-ui prose-headings:font-editorial prose prose-zinc mt-8 max-w-none prose-p:text-[17px] prose-p:leading-8 prose-p:text-foreground/90 prose-a:text-accent prose-a:underline prose-a:decoration-accent/55 prose-a:underline-offset-4 prose-a:transition-colors hover:prose-a:text-primary hover:prose-a:decoration-primary prose-strong:text-foreground"
          dangerouslySetInnerHTML={{
            __html: renderArticleContentHtml(post.content),
          }}
        />

        {post.tags.length > 0 ? (
          <section className="mt-10 border-t border-border/70 pt-6">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Tags className="size-4 text-accent" />
              Tags
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {post.tags.map((tag) => (
                <Link
                  key={tag.tag.id}
                  href={`/fwq/tags/${tag.tag.slug}/page/1`}
                  prefetch
                  className="inline-flex min-h-9 items-center rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
                >
                  #{tag.tag.name}
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}

export default function EnglishPostPage({ params }: PageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Suspense
        fallback={<main className="flex-1 px-4 py-10">Loading...</main>}
      >
        <EnglishPostContent params={params} />
      </Suspense>
      <Footer />
    </div>
  );
}
