import { Toaster } from "sonner";
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { isUnauthorizedError, requireAdminSession } from "@fwqgo/auth/session";

import { AppSidebar } from "@/components/endpoint/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CmsWorkspaceHeader } from "@/features/cms/components/cms-workspace-header";
import { CmsReleaseGuard } from "@/features/cms/components/cms-release-guard";
import { AdminLoading } from "@/features/cms/components/admin-loading";

export const metadata: Metadata = {
  title: "后台系统",
  description: "服务器go的后台系统，用来管理服务器go的文章。",
  icons: [{ rel: "icon", url: "/icon.svg" }],
};

async function requireAdminPageSession() {
  try {
    await requireAdminSession();
  } catch (error) {
    if (isUnauthorizedError(error)) redirect("/api/auth/session-expired");
    // Next.js prerender interruptions and database errors must keep their
    // original semantics instead of being converted into authentication errors.
    throw error;
  }
}

async function AuthenticatedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdminPageSession();

  return (
    <div className="cms-theme min-h-dvh bg-background [&_input]:text-sm max-sm:[&_input]:text-base [&_textarea]:text-sm max-sm:[&_textarea]:text-base">
      <a href="#cms-main-content" className="cms-skip-link">
        跳转到工作区
      </a>
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
      <div className="min-h-dvh">
        <SidebarProvider
          style={
            {
              "--sidebar-width": "15.5rem",
              "--sidebar-width-icon": "4rem",
            } as React.CSSProperties
          }
        >
          <AppSidebar />
          <SidebarInset className="min-w-0">
            <CmsWorkspaceHeader />
            <div
              id="cms-main-content"
              tabIndex={-1}
              className="min-w-0 flex-1 outline-none"
            >
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  );
}

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<AdminLoading title="正在验证登录状态" />}>
      <AuthenticatedAdminLayout>{children}</AuthenticatedAdminLayout>
    </Suspense>
  );
}
