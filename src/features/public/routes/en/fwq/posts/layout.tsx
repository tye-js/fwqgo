import Header from "@/features/public/components/header";
import Footer from "@/features/public/components/footer";

/**
 * Keep the article shell outside the article loading boundary. The English
 * route previously rendered Header and Footer from page.tsx, so loading.tsx
 * replaced the whole document shell while the post was being resolved. That
 * made the first refresh visibly jump and created another opportunity for
 * streamed resume segments to be reconciled in the wrong order.
 */
export default function EnglishArticleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Header language="en" />
      {children}
      <Footer language="en" />
    </div>
  );
}
