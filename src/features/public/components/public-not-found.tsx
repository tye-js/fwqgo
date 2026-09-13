import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "./header";
import Footer from "./footer";
import { PublicDiscovery } from "./public-discovery";
import { ServerCoverArt } from "./server-cover-art";

export function PublicNotFound({ language }: { language: "zh" | "en" }) {
  const english = language === "en";
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Suspense fallback={<div className="h-20 border-b border-border" />}>
        <Header language={language} />
      </Suspense>
      <main
        id="main-content"
        className="public-container flex-1 space-y-8 py-10 md:py-16"
      >
        <section className="public-panel grid overflow-hidden md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="min-w-0 p-6 sm:p-9 lg:p-12">
            <p className="public-kicker">404 / PAGE NOT FOUND</p>
            <h1 className="font-editorial mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {english
                ? "A missing page. A new place to start."
                : "这个页面找不到了，换个方向继续探索。"}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              {english
                ? "The link may have changed or the content is no longer available. Search the journal, or explore a useful section below."
                : "链接可能已经变化，或内容暂时不可用。你可以重新搜索，也可以从下面的入口继续阅读。"}
            </p>
            <form
              action="/search"
              method="get"
              className="mt-6 flex flex-col gap-2 sm:flex-row"
            >
              {english ? <input type="hidden" name="lang" value="en" /> : null}
              <label className="min-w-0 flex-1">
                <span className="sr-only">
                  {english ? "Search keywords" : "搜索关键词"}
                </span>
                <input
                  type="search"
                  name="q"
                  placeholder={
                    english
                      ? "Find articles, providers, regions…"
                      : "查找文章、商家或地区…"
                  }
                  className="h-12 w-full rounded-lg border border-input bg-background px-4 text-base"
                />
              </label>
              <Button type="submit" className="h-12 rounded-lg">
                <Search className="size-4" />
                {english ? "Search" : "搜索"}
              </Button>
            </form>
            <Link
              href={english ? "/en" : "/"}
              className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
            >
              {english ? "Back to home" : "返回首页"}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="hidden md:block">
            <ServerCoverArt />
          </div>
        </section>
        <PublicDiscovery language={language} />
      </main>
      <Suspense fallback={null}>
        <Footer language={language} />
      </Suspense>
    </div>
  );
}
