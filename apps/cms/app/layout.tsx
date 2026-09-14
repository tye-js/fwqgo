export { metadata } from "@/features/shared/routes/layout";

import { DocumentBody } from "@/features/shared/components/document-body";
import "@/styles/cms.css";

export default function CmsRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="cms-app" data-scroll-behavior="smooth">
      <DocumentBody>{children}</DocumentBody>
    </html>
  );
}
