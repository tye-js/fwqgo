import { Toaster } from "sonner";
import { type Metadata } from "next";

import { AppSidebar } from "@/components/endpoint/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import AppBreadcrumb from "@/components/endpoint/app-breadcrumb";

export const metadata: Metadata = {
  title: " 后台系统",
  description: "服务器go的后台系统，用来管理服务器go的文章。",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};
export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background">
      {/* 添加 Toaster 组件用于消息通知 */}
      <Toaster
        position="top-center"
        expand={false}
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
          <AppSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
              <div className="flex items-center gap-2 px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <AppBreadcrumb />
              </div>
            </header>
            {children}
          </SidebarInset>
        </SidebarProvider>
      </main>
    </div>
  );
}
