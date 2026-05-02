import Link from "next/link";
import { ArrowLeft, Compass, Home, SearchCheck, Sparkles } from "lucide-react";

import { getCategories } from "@/app/_actions/category";
import { getPostsWithTags } from "@/app/_actions/post";
import { BrandLogo } from "@/components/brand/brand-logo";
import Footer from "@/app/_components/footer";
import Header from "@/app/_components/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default async function NotFound() {
  const [{ data: categories }, { data: posts }] = await Promise.all([
    getCategories(),
    getPostsWithTags(),
  ]);

  const quickCategories = (categories ?? [])
    .flatMap((category) =>
      category.children.length > 0 ? category.children : [category],
    )
    .slice(0, 6);
  const recentPosts = (posts ?? []).slice(0, 4);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <Separator />

      <main className="not-found-surface relative flex-1 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.1),transparent_24%)]" />
        <div className="container relative mx-auto px-4 py-10 md:py-16">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="overflow-hidden border-border/70 bg-background/90 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
              <CardHeader className="space-y-6 pb-4">
                <BrandLogo compact />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground">
                    404 / Not Found
                  </Badge>
                  <Badge variant="secondary">资源未找到</Badge>
                </div>
                <div className="space-y-4">
                  <p className="text-6xl font-semibold tracking-tight text-primary md:text-7xl">
                    404
                  </p>
                  <CardTitle className="font-editorial max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.05em] md:text-4xl">
                    你来到了一片资源荒漠，但不必从头开始找路
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                    这个链接可能已经失效、内容被移动，或者你刚好输错了地址。下面给你几个最快能回到主内容区的入口，继续找 VPS、云服务器和独立服务器优惠。
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap gap-3">
                  <Button asChild size="lg" className="rounded-full px-6">
                    <Link href="/">
                      返回首页
                      <Home className="size-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="rounded-full px-6">
                    <Link href="/fwq/vps/page/1">
                      去看服务器分类
                      <Compass className="size-4" />
                    </Link>
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <SearchCheck className="size-5 text-primary" />
                    <p className="mt-4 font-medium">先按分类走</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      如果你是从搜索引擎进来的，先回到分类页通常最快。
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <Sparkles className="size-5 text-primary" />
                    <p className="mt-4 font-medium">看看最新内容</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      新文章通常会覆盖最新优惠、测评和线路变化。
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <ArrowLeft className="size-5 text-primary" />
                    <p className="mt-4 font-medium">重新选择方向</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      从香港、出海、高防、原生 IP 这些入口重新筛选会更高效。
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="border-border/70 bg-background/85 shadow-sm backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-xl">你可能在找</CardTitle>
                  <CardDescription>
                    这些入口通常能帮你快速重新找到目标内容。
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  {quickCategories.map((category) => (
                    <Link
                      key={category.id}
                      href={`/fwq/${category.slug}/page/1`}
                      className="inline-flex rounded-full border border-border/70 bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                    >
                      {category.name}
                    </Link>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-background/85 shadow-sm backdrop-blur">
                <CardHeader>
                  <CardTitle className="text-xl">最近更新的文章</CardTitle>
                  <CardDescription>
                    如果你只是想继续看内容，可以从这里直接进入。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recentPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/fwq/posts/${post.slug}`}
                      className="block rounded-2xl border border-border/70 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
                    >
                      <p className="line-clamp-2 font-medium">{post.title}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {post.createdAt.toLocaleDateString("zh-CN")}
                      </p>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Separator className="mt-4" />
      <Footer />
    </div>
  );
}
