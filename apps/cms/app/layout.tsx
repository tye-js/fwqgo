import RootLayout, { metadata } from "@/app/layout";

export { metadata };

export default function CmsRootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <RootLayout>{children}</RootLayout>;
}
