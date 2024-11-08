import "@/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

import Header from "./_components/header";
import Footer from "./_components/footer";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "服务器go",
  description: "服务器go",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${GeistSans.variable}`}>
      <body className="flex flex-col bg-background">
        <Header />
        <Separator />
        <main className="container mx-auto min-h-[90vh] flex-1">
          {children}
        </main>
        <Separator />
        <Footer />
      </body>
    </html>
  );
}
