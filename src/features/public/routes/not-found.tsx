import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, Compass, Home, SearchCheck, Sparkles } from "lucide-react";

import { BrandLogo } from "@/components/brand/brand-logo";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
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

const quickCategories = [
  { id: 1, name: "香港服务器", href: "/servers/hong-kong" },
  { id: 2, name: "美国服务器", href: "/servers/united-states" },
  { id: 3, name: "便宜 VPS", href: "/servers/cheap-vps" },
  { id: 4, name: "CN2 线路", href: "/search?q=CN2" },
  { id: 5, name: "CMI 线路", href: "/search?q=CMI" },
  { id: 6, name: "独立服务器", href: "/search?q=独立服务器" },
];

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Suspense fallback={<div className="h-[73px] border-b border-border/60" />}>
        <Header />
      </Suspense>
      <Separator />

      <main className="not-found-surface relative flex-1 overflow-hidden">
        <div className="container relative mx-auto px-4 py-10 md:py-16">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <Card className="overflow-hidden rounded-lg border-border/70 bg-background shadow-sm">
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
                  <CardTitle className="font-editorial max-w-2xl text-3xl font-semibold leading-tight md:text-4xl">
                    你来到了一片资源荒漠，但不必从头开始找路
                  </CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">
                    这个链接可能已经失效、内容被移动，或者你刚好输错了地址。下面给你几个最快能回到主内容区的入口，继续找 VPS、云服务器和独立服务器优惠。
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-wrap gap-3">
                  <Button asChild size="lg" className="rounded-md px-6">
                    <Link href="/" prefetch>
                      返回首页
                      <Home className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="rounded-md px-6"
                  >
                    <Link href="/servers" prefetch>
                      去看服务器比价
                      <Compass className="size-4" />
                    </Link>
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <SearchCheck className="size-5 text-primary" />
                    <p className="mt-4 font-medium">先按分类走</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      如果你是从搜索引擎进来的，先回到分类页通常最快。
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <Sparkles className="size-5 text-primary" />
                    <p className="mt-4 font-medium">看看最新内容</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      新文章通常会覆盖最新优惠、测评和线路变化。
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
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
              <Card className="rounded-lg border-border/70 bg-background shadow-sm">
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
                      href={category.href}
                      prefetch
                      className="inline-flex min-h-11 items-center rounded-md border border-border/70 bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {category.name}
                    </Link>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-lg border-border/70 bg-background shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">继续浏览</CardTitle>
                  <CardDescription>
                    如果不确定原链接对应的内容，可以从这些稳定入口重新筛选。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { title: "服务器比价", href: "/servers" },
                    { title: "香港服务器专题", href: "/servers/hong-kong" },
                    { title: "美国服务器专题", href: "/servers/united-states" },
                    { title: "便宜 VPS 专题", href: "/servers/cheap-vps" },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      className="block rounded-md border border-border/70 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <p className="line-clamp-2 font-medium">{item.title}</p>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      <Separator className="mt-4" />
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </div>
  );
}
