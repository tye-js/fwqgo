import { Toaster } from "sonner";
import { type Metadata } from "next";

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
      <main className="container mx-auto p-4">{children}</main>
    </div>
  );
}
