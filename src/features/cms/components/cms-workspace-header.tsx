import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import AppBreadcrumb from "@/components/endpoint/app-breadcrumb";
import { isHttpHref } from "@fwqgo/core/utils";
import { CmsQuickNavigation } from "./cms-quick-navigation";

export function CmsWorkspaceHeader() {
  const publicUrl = process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com";
  return (
    <header className="sticky top-0 z-20 flex min-h-14 min-w-0 items-center justify-between gap-3 border-b border-border bg-card/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-md md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SidebarTrigger className="size-11 shrink-0 rounded-lg" />
        <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Suspense
            fallback={
              <span className="text-sm text-muted-foreground">工作空间</span>
            }
          >
            <AppBreadcrumb />
          </Suspense>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <CmsQuickNavigation />
        <Button
          asChild
          variant="ghost"
          className="hidden min-h-11 rounded-lg text-muted-foreground xl:inline-flex"
        >
          <a
            href={isHttpHref(publicUrl) ? publicUrl : "https://fwqgo.com"}
            target="_blank"
            rel="noopener noreferrer"
          >
            查看网站
            <ArrowUpRight className="size-4" />
          </a>
        </Button>
        <Button asChild className="hidden min-h-11 rounded-lg sm:inline-flex">
          <Link href="/posts/create">
            <Plus className="size-4" />
            新建文章
          </Link>
        </Button>
      </div>
    </header>
  );
}
