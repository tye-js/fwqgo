export { englishMetadata as metadata } from "@/features/shared/routes/layout";

import { DocumentBody } from "@/features/shared/components/document-body";

export default function EnglishRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <DocumentBody>{children}</DocumentBody>
    </html>
  );
}
