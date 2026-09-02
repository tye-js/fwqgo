import { type Metadata } from "next";

import { DocumentBody } from "@/features/shared/components/document-body";

function getMetadataBase() {
  const value = process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com";
  return new URL(value.endsWith("/") ? value : `${value}/`);
}

const sharedMetadata: Metadata = {
  metadataBase: getMetadataBase(),
  icons: {
    icon: "/icon.svg",
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
  other: {
    "impact-site-verification": "dd276990-077b-4697-8ee5-2afcb05cdd99",
  },
};

export const metadata: Metadata = {
  ...sharedMetadata,
  title: "服务器go",
  description:
    "服务器go为您汇总国内国外VPS、云服务器、独立服务器、原生IP云服务器的最新促销信息，更有商家背景、售后服务全面解析，助您轻松选购高性价比服务器！",
  keywords:
    "服务器go,VPS,云服务器,独立服务器,原生IP云服务器,CN2 GIA VPS,最新优惠码,服务器商家推荐,服务器购买指南",
};

export const englishMetadata: Metadata = {
  ...sharedMetadata,
  title: "fwqgo",
  description:
    "Server deals, reviews, comparisons, and practical knowledge for VPS, cloud, dedicated servers, networks, and operations.",
  keywords:
    "fwqgo,VPS,cloud servers,dedicated servers,server deals,hosting reviews,server knowledge base",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <DocumentBody>{children}</DocumentBody>
    </html>
  );
}
