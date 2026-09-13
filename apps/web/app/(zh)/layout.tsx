export { metadata } from "@/features/shared/routes/layout";

import { DocumentBody } from "@/features/shared/components/document-body";
import "@/styles/public.css";

export default function ChineseRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="public-site" data-scroll-behavior="smooth">
      <DocumentBody>{children}</DocumentBody>
    </html>
  );
}
