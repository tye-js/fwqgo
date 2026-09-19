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
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  other: {
    "impact-site-verification": "dd276990-077b-4697-8ee5-2afcb05cdd99",
  },
};

export const metadata: Metadata = {
  ...sharedMetadata,
  title: "服务器go - VPS优惠与服务器评测｜香港/美国VPS推荐",
  description:
    "服务器go 汇总 VPS、云服务器与独立服务器优惠，覆盖香港、美国、日本机房与 CN2 GIA、CMIN2、原生IP 等线路，提供价格比价、商家评测与选购指南，帮你选到高性价比服务器。",
  keywords:
    "服务器go,VPS优惠,服务器优惠,香港VPS,美国VPS,CN2 GIA VPS,原生IP服务器,云服务器,独立服务器,VPS推荐,服务器比价",
};

export const englishMetadata: Metadata = {
  ...sharedMetadata,
  title: "fwqgo - VPS Deals, Server Reviews & Hosting Comparisons",
  description:
    "Server deals, reviews, comparisons, and practical knowledge for VPS, cloud, dedicated servers, networks, and operations.",
  keywords:
    "fwqgo,VPS deals,cheap VPS,Hong Kong VPS,US VPS,CN2 GIA VPS,residential IP VPS,cloud servers,dedicated servers,hosting reviews",
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
