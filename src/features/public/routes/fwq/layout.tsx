import Header from "@/features/public/components/header";
import Footer from "@/features/public/components/footer";
import { Separator } from "@/components/ui/separator";
import { ScrollToTop } from "@/features/public/components/scroll-to-top";
import { Suspense } from "react";
export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col bg-background">
      <Header />
      <Separator />
      <main className="container mx-auto min-h-[90vh] flex-1 py-2 md:py-4">
        <Suspense fallback={<div className="p-4">加载中...</div>}>
          {children}
        </Suspense>
      </main>
      <Separator className="mt-4" />
      <Footer />
      <ScrollToTop />
    </div>
  );
}
