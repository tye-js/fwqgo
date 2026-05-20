import {
  getPostWithTagsBySlug,
  getPostBySlug,
  getLatestPostsForSidebar,
  getPostsByPostId,
} from "@/app/_actions/post";

import { decodeSlug, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { Metadata } from "next";
import { TableOfContents } from "@/components/toc/table-of-contents";
import {
  BookOpenText,
  ArrowLeftToLine,
  ArrowRightToLine,
  Clock,
  ChevronRight,
  SquareLibrary,
  Tags,
} from "lucide-react";
import Image from "next/image";
import { Suspense } from "react";
import { PostViewCount } from "@/app/_components/post-view-count";
import { RecommendedPostCard } from "@/app/_components/recommended-post-card";
import { WebmasterStatement } from "@/app/_components/webmaster-statement";
import { Card, CardContent } from "@/components/ui/card";
import { notFound } from "next/navigation";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const params = await props.params;
  const decodedSlug = decodeSlug(params.slug);
  const { data: post, error } = await postInfo(decodedSlug);
  if (error || !post)
    return {
      title: "服务器go",
      description: "查看所有服务器相关的文章",
    };
  return {
    title: post.title,
    description: post.description ?? `${post.title}`,
    keywords: post.keywords ?? `${post.title}`,
  };
}

async function PostPageContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ slug: string }>;
}) {
  const params = await paramsPromise;
  const decodedSlug = decodeSlug(params.slug);
  const { data, error } = await getPostWithTagsBySlug(decodedSlug);
  if (error) return <div>加载失败: {error}</div>;
  if (!data) notFound();
  const { post, recommendedPosts } = data;

  if (!post) notFound();
  const contentWithIds = post.content;

  const { data: posts } = await getPostsByPostId(post.id);
  const [prevPost, nextPost] = posts ?? [null, null];
  const { data: latestPosts } = await getLatestPostsForSidebar();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    image: post.imgUrl,
    description: post.description,
    datePublished: post.createdAt,
    author: {
      "@type": "Person",
      name: "服务器go",
    },
    publisher: {
      "@type": "Organization",
      name: "服务器go",
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://fwqgo.com/fwq/posts/${decodedSlug}`,
    },
  };
  return (
    <div className="py-6 md:py-8">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,0.83fr)_320px]">
        <div className="space-y-6">
          <article className="overflow-hidden rounded-[30px] border border-border/70 bg-background/92 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.32)]">
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            <div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.35),rgba(255,255,255,0.92))] px-6 py-6 md:px-8 md:py-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-primary text-primary-foreground">
                  文章详情
                </Badge>
                {post.recommendedTagName ? (
                  <Badge variant="secondary">{post.recommendedTagName}</Badge>
                ) : null}
              </div>
              <h1 className="font-editorial mt-5 max-w-4xl text-4xl font-semibold leading-tight tracking-[-0.05em] text-foreground md:text-5xl">
                {post.title}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base">
                {post.description ??
                  "这篇文章包含线路、机房、价格与使用场景的完整信息，适合继续深入阅读。"}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-muted-foreground">
                <div className="inline-flex items-center gap-2">
                  <Clock className="size-4" />
                  {formatDate(post.createdAt)}
                </div>
                <PostViewCount slug={decodedSlug} initialViews={post.views} />
                {post.recommendedTagName ? (
                  <Link
                    href={`/fwq/tags/${post.recommendedTagSlug ?? post.recommendedTagName}/page/1`}
                    className="inline-flex items-center gap-2 transition-colors hover:text-foreground"
                  >
                    <Tags className="size-4" />
                    {post.recommendedTagName}
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="px-6 pb-8 pt-6 md:px-8 md:pb-10">
              <div className="relative overflow-hidden rounded-[26px] border border-border/70 bg-muted/20">
              {post.imgUrl ? (
                <Image
                  src={process.env.NEXT_PUBLIC_URL + post.imgUrl}
                  alt={post.title}
                    width={1440}
                    height={840}
                    sizes="(max-width: 768px) 100vw, 960px"
                  className="h-auto w-full object-cover"
                  priority
                />
              ) : (
                  <div className="h-[320px] w-full bg-[radial-gradient(circle_at_top_left,hsl(var(--accent)/0.18),transparent_34%),linear-gradient(135deg,hsl(var(--muted)),hsl(var(--background)))]"></div>
              )}
            </div>

              <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_250px]">
                <div className="space-y-8">
                  <div
                    className="article-prose font-editorial prose prose-zinc max-w-none prose-headings:font-editorial prose-headings:tracking-[-0.04em] prose-h2:mt-10 prose-h2:text-3xl prose-h3:mt-8 prose-h3:text-2xl prose-p:text-[17px] prose-p:leading-8 prose-a:text-accent prose-a:no-underline hover:prose-a:text-foreground prose-strong:text-foreground prose-img:rounded-[20px] prose-blockquote:border-l-4 prose-blockquote:border-accent prose-blockquote:bg-accent/5 prose-blockquote:px-6 prose-blockquote:py-3 prose-blockquote:font-ui prose-blockquote:text-base prose-li:my-2 prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-ui prose-code:text-sm"
                    dangerouslySetInnerHTML={{ __html: contentWithIds }}
                  />

                  <WebmasterStatement />
                </div>

                <div className="space-y-4">
                  <Card className="rounded-[24px] border-border/70 bg-muted/20 shadow-none">
                    <CardContent className="p-5">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <BookOpenText className="size-4 text-accent" />
                        本文标签
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {post.tags?.map((tag) => (
                          <Link
                            key={tag.tag.id}
                            href={`/fwq/tags/${tag.tag.slug}/page/1`}
                            className="rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/15"
                          >
                            #{tag.tag.name}
                          </Link>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {prevPost || nextPost ? (
                    <Card className="rounded-[24px] border-border/70 bg-muted/20 shadow-none">
                      <CardContent className="space-y-3 p-5">
                        <div className="text-sm font-medium text-foreground">
                          上下篇文章
                        </div>
                        {prevPost ? (
                          <Link
                            href={`/fwq/posts/${prevPost.slug}`}
                            className="group flex items-start gap-3 rounded-2xl border border-border/70 bg-background px-4 py-3 transition-colors hover:border-accent/30"
                          >
                            <ArrowLeftToLine className="mt-1 size-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">上一篇</p>
                              <p className="mt-1 text-sm font-medium leading-6 text-foreground transition-colors group-hover:text-accent">
                                {prevPost.title}
                              </p>
                            </div>
                          </Link>
                        ) : null}
                        {nextPost ? (
                          <Link
                            href={`/fwq/posts/${nextPost.slug}`}
                            className="group flex items-start gap-3 rounded-2xl border border-border/70 bg-background px-4 py-3 transition-colors hover:border-accent/30"
                          >
                            <ArrowRightToLine className="mt-1 size-4 text-muted-foreground" />
                            <div>
                              <p className="text-xs text-muted-foreground">下一篇</p>
                              <p className="mt-1 text-sm font-medium leading-6 text-foreground transition-colors group-hover:text-accent">
                                {nextPost.title}
                              </p>
                            </div>
                          </Link>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              </div>
            </div>
          </article>

        {recommendedPosts && recommendedPosts.length > 0 && (
          <section className="space-y-4 rounded-[30px] border border-border/70 bg-background/92 px-6 py-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.28)] md:px-8">
            <div className="flex flex-wrap items-center gap-2">
              <SquareLibrary className="size-5 text-accent" />
              <h3 className="font-editorial text-2xl font-semibold tracking-[-0.04em]">
                {post.recommendedTagName
                  ? `推荐阅读 · ${post.recommendedTagName}`
                  : "推荐阅读"}
              </h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {recommendedPosts.map((post) => (
                <RecommendedPostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="hidden xl:block">
        <div className="sticky top-24 space-y-4">
          <Card className="rounded-[26px] border-border/70 bg-background/90 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <BookOpenText className="size-4 text-accent" />
                本文目录
              </div>
              <div className="mt-4">
                <TableOfContents content={contentWithIds} />
              </div>
            </CardContent>
          </Card>

        {latestPosts && latestPosts.length > 0 && (
            <Card className="rounded-[26px] border-border/70 bg-background/90 shadow-none">
              <CardContent className="space-y-3 p-5">
                <div className="text-sm font-medium text-foreground">
                  最新文章
                </div>
              {latestPosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/fwq/posts/${post.slug}`}
                    className="group flex items-start justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3 transition-colors hover:border-accent/30 hover:bg-accent/5"
                  >
                    <div>
                      <p className="line-clamp-2 text-sm font-medium leading-6 text-foreground transition-colors group-hover:text-accent">
                        {post.title}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                  </Link>
              ))}
              </CardContent>
            </Card>
        )}
        </div>
      </aside>
      </div>
    </div>
  );
}

async function postInfo(slug: string) {
  return await getPostBySlug(slug);
}

export default function PostPage(props: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PostPageContent paramsPromise={props.params} />
    </Suspense>
  );
}
