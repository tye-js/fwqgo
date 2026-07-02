import { Toaster } from "sonner";
import { type Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BookMarked } from "lucide-react";

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
import { Suspense } from "react";

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
    <div className="cms-theme editorial-surface min-h-screen bg-background">
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
      <main className="mx-auto p-4">
        <SidebarProvider>
          <Suspense fallback={null}>
            <AppSidebar />
          </Suspense>
          <SidebarInset>
            <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-border/60 bg-background/85 transition-[width,height] backdrop-blur-xl ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-3 px-4">
                <SidebarTrigger className="-ml-1 rounded-full border border-border/70 bg-background/90" />
                <Separator orientation="vertical" className="mr-1 h-4" />
                <BookMarked className="size-4 text-primary" />
                <Suspense fallback={null}>
                  <AppBreadcrumb />
                </Suspense>
              </div>
            </header>
            <Suspense fallback={<div className="p-4">加载中...</div>}>
              {children}
            </Suspense>
          </SidebarInset>
        </SidebarProvider>
      </main>
    </div>
  );
}
