export { metadata } from "@/features/shared/routes/layout";

import { DocumentBody } from "@/features/shared/components/document-body";

export default function ChineseRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <DocumentBody>{children}</DocumentBody>
    </html>
  );
}
