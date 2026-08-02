import type { Metadata } from "next";

import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { NetworkLineSelector } from "@/features/public/components/network-line-selector";
import type { PublicKnowledgeLanguage } from "@/features/public/data/knowledge";

const copy = {
  zh: {
    title: "运营商线路评估：按地区和业务查看 IPv4 线路证据",
    description:
      "根据用户地区、运营商权重、目标机房和业务类型，查看已发布的双向线路评估；没有足够证据时不输出伪推荐。",
  },
  en: {
    title:
      "Carrier route assessment: compare IPv4 evidence by region and workload",
    description:
      "Compare published bidirectional route assessments by user region, carrier weights, destination, and workload without inventing a recommendation when evidence is missing.",
  },
} as const;

function siteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export function buildNetworkLinesMetadata(
  language: PublicKnowledgeLanguage,
): Metadata {
  const text = copy[language];
  const pathname =
    language === "en" ? "/en/tools/network-lines" : "/tools/network-lines";
  return {
    title: text.title,
    description: text.description,
    alternates: {
      canonical: `${siteUrl()}${pathname}`,
      languages: {
        "zh-CN": `${siteUrl()}/tools/network-lines`,
        en: `${siteUrl()}/en/tools/network-lines`,
        "x-default": `${siteUrl()}/tools/network-lines`,
      },
    },
    robots: { index: true, follow: true },
  };
}

export function generateMetadata(): Metadata {
  return buildNetworkLinesMetadata("zh");
}

export default function NetworkLinesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language="zh" />
      <NetworkLineSelector language="zh" />
      <Footer language="zh" />
    </div>
  );
}
