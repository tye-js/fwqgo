export { metadata } from "@/features/shared/routes/layout";

import { DocumentBody } from "@/features/shared/components/document-body";
import { PublicToaster } from "@/features/public/components/public-toaster";
import "@/styles/public.css";

export default function ChineseRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="public-site" data-scroll-behavior="smooth">
      <DocumentBody>
        {children}
        <PublicToaster />
      </DocumentBody>
    </html>
  );
}
