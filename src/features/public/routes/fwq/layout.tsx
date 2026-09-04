import Header from "@/features/public/components/header";
import Footer from "@/features/public/components/footer";
import { Separator } from "@/components/ui/separator";
import { ScrollToTop } from "@/features/public/components/scroll-to-top";
export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Header />
      <Separator />
      <main className="container mx-auto min-h-0 flex-1 py-2 md:py-4">
        {children}
      </main>
      <Separator className="mt-4" />
      <Footer />
      <ScrollToTop />
    </div>
  );
}
