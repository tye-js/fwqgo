import "@/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";
import { OpenPanelComponent } from "@openpanel/nextjs";

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
    <html lang="zh-CN" className={`${GeistSans.variable}`}>
      <OpenPanelComponent
        clientId="9aad57c8-1f8c-43a7-9a99-b03d2bd76860"
        trackScreenViews={true}
        // trackAttributes={true}
        // trackOutgoingLinks={true}
        // If you have a user id, you can pass it here to identify the user
        // profileId={'123'}
      />
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
