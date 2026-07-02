import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Tags } from "lucide-react";

import { getEnglishPostWithTagsBySlug } from "@/features/public/data/post";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { ArticleShareActions } from "@/features/public/components/article-share-actions";
import { getOptimizedImageSrc } from "@fwqgo/core/image-src";
import { decodeSlug, formatDate } from "@fwqgo/core/utils";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(/\/+$/, "");
}

function toAbsoluteUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value, getSiteUrl()).toString();
  } catch {
    return undefined;
  }
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const decodedSlug = decodeSlug(slug);
  const { data, error } = await getEnglishPostWithTagsBySlug(decodedSlug);

  if (error || !data?.post) {
    return {
      title: "Server deals - fwqgo",
      description: "Server and VPS deal articles.",
    };
  }

  const post = data.post;
  if (!post.title || !post.content) {
    return {
      title: "Server deals - fwqgo",
      description: "Server and VPS deal articles.",
    };
  }
  const canonicalUrl = `${getSiteUrl()}/en/fwq/posts/${encodeURIComponent(decodedSlug)}`;
  const zhUrl = `${getSiteUrl()}/fwq/posts/${encodeURIComponent(post.slug)}`;
  const description = post.description ?? post.title;
  const imageUrl = toAbsoluteUrl(post.imgUrl);

  return {
    title: post.title,
    description,
    keywords: post.keywords ?? post.title,
    alternates: {
      canonical: canonicalUrl,
      languages: {
        "zh-CN": zhUrl,
        en: canonicalUrl,
      },
    },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: canonicalUrl,
      siteName: "fwqgo",
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: 1200,
              height: 630,
              alt: post.title,
            },
          ]
        : undefined,
    },
  };
}

async function EnglishPostContent({ params }: PageProps) {
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

  return (
    <main className="flex-1">
      <article className="container mx-auto max-w-4xl px-4 py-6 md:py-10">
        <Link
          href={`/fwq/posts/${post.slug}`}
          prefetch
          className="inline-flex items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          Chinese version
        </Link>

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

        {post.imgUrl ? (
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
          className="article-prose font-ui prose prose-zinc mt-8 max-w-none prose-headings:font-editorial prose-p:text-[17px] prose-p:leading-8 prose-p:text-foreground/90 prose-a:text-accent prose-strong:text-foreground"
          dangerouslySetInnerHTML={{ __html: post.content }}
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
      <Suspense fallback={<main className="flex-1 px-4 py-10">Loading...</main>}>
        <EnglishPostContent params={params} />
      </Suspense>
      <Footer />
    </div>
  );
}
