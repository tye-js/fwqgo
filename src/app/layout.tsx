import "@/styles/globals.css";

import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "服务器go",
  description:
    "服务器go为您汇总国内国外VPS、云服务器、独立服务器、原生IP云服务器的最新促销信息，更有商家背景、售后服务全面解析，助您轻松选购高性价比服务器！",
  keywords:
    "服务器go,VPS,云服务器,独立服务器,原生IP云服务器,CN2 GIA VPS,原生IP云服务器,最新优惠码,服务器商家推荐,服务器购买指南",
  icons: { icon: "/icon.svg" },
  other: {
    "impact-site-verification": "dd276990-077b-4697-8ee5-2afcb05cdd99",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="font-ui bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
