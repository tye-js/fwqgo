import type { Metadata } from "next";
import "./globals.css";
import Footer from "@/components/footer/Footer";
import Header from "@/components/header/Header";



export const metadata: Metadata = {
  title: "服务器go",
  description: "服务器评测分享网站",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
      >
        <Header/>
        <main className="h-[90vh]">{children}</main>
        <Footer/>
      </body>
    </html>
  );
}
