import { Toaster } from "sonner";
import { type Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppSidebar } from "@/components/endpoint/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import AppBreadcrumb from "@/components/endpoint/app-breadcrumb";
import { validateSession } from "@/features/cms/actions/validate-session";

export const metadata: Metadata = {
  title: "后台系统",
  description: "服务器go的后台系统，用来管理服务器go的文章。",
  icons: [{ rel: "icon", url: "/icon.svg" }],
};

async function SessionGuard() {
  const headersList = await headers();
  const sessionId = headersList.get("x-session-id");
  // 验证 session
  if (!sessionId) redirect("/login");
  try {
    const isValid = await validateSession(sessionId);
    if (!isValid) redirect("/login");
  } catch (error) {
    console.error(error);
    redirect("/login");
  }
  return null;
}

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="cms-theme min-h-screen bg-background">
      <Suspense fallback={null}>
        <SessionGuard />
      </Suspense>
      <Toaster
        position="top-right"
        expand
        closeButton
        duration={6000}
        richColors
        toastOptions={{
          style: {
            background: "hsl(var(--background))",
            color: "hsl(var(--foreground))",
            border: "1px solid hsl(var(--border))",
          },
          className: "dark:bg-zinc-950 dark:text-zinc-50",
        }}
      />
      <main className="min-h-screen">
        <SidebarProvider>
          <Suspense fallback={null}>
            <AppSidebar />
          </Suspense>
          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-border bg-background/95 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-11 md:h-12">
              <div className="flex min-w-0 items-center gap-2 px-3">
                <SidebarTrigger className="-ml-1 size-9 md:size-7" />
                <Separator orientation="vertical" className="h-4" />
                <Suspense fallback={null}>
                  <AppBreadcrumb />
                </Suspense>
              </div>
            </header>
            <div className="min-w-0 overflow-x-hidden">
              <Suspense fallback={<div className="p-4">加载中...</div>}>
                {children}
              </Suspense>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </main>
    </div>
  );
}
