import Header from "@/app/_components/header";
import Footer from "@/app/_components/footer";
import { Separator } from "@/components/ui/separator";

export default function CreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col bg-background">
      <Header />
      <Separator />
      <main className="container mx-auto min-h-[90vh] flex-1">{children}</main>
      <Separator className="mt-4" />
      <Footer />
    </div>
  );
}
