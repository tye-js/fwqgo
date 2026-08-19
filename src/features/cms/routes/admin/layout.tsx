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
import { CmsReleaseGuard } from "@/features/cms/components/cms-release-guard";

export const metadata: Metadata = {
  title: "后台系统",
  description: "服务器go的后台系统，用来管理服务器go的文章。",
  icons: [{ rel: "icon", url: "/icon.svg" }],
};

async function SessionGuard() {
  const headersList = await headers();
  const sessionId = headersList.get("x-session-id");
  if (!sessionId) redirect("/login");

  let isValid = false;
  try {
    isValid = await validateSession(sessionId);
  } catch (error) {
    console.error("Session validation failed:", error);
    redirect("/login?reason=session_check_failed");
  }

  if (!isValid) redirect("/api/auth/session-expired");
  return null;
}

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="cms-theme min-h-dvh bg-background [&_input]:text-sm max-sm:[&_input]:text-base [&_textarea]:text-sm max-sm:[&_textarea]:text-base">
      <Suspense fallback={null}>
        <SessionGuard />
      </Suspense>
      <CmsReleaseGuard releaseId={process.env.RELEASE_ID ?? "local"} />
      <Toaster
        position="top-center"
        expand={false}
        closeButton
        duration={5000}
        visibleToasts={3}
        offset={{ top: "calc(3.5rem + env(safe-area-inset-top) + 0.5rem)" }}
        mobileOffset={{
          top: "calc(3.5rem + env(safe-area-inset-top) + 0.5rem)",
          left: "0.75rem",
          right: "0.75rem",
        }}
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
      <main className="min-h-dvh">
        <SidebarProvider>
          <Suspense fallback={null}>
            <AppSidebar />
          </Suspense>
          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 pt-[env(safe-area-inset-top)] transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:min-h-14">
              <div className="flex min-w-0 items-center gap-2 px-3">
                <SidebarTrigger className="-ml-1 size-11" />
                <Separator orientation="vertical" className="h-4" />
                <Suspense fallback={null}>
                  <AppBreadcrumb />
                </Suspense>
              </div>
            </header>
            <div className="min-w-0 overflow-x-hidden">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </main>
    </div>
  );
}
