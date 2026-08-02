import type { Metadata } from "next";

import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { NetworkLineSelector } from "@/features/public/components/network-line-selector";
import { getPublishedNetworkExperienceRuleSnapshot } from "@/features/public/data/network-experience";
import type { PublicKnowledgeLanguage } from "@/features/public/data/knowledge";

const copy = {
  zh: {
    title: "运营商线路经验：按地区和业务了解线路选择",
    description:
      "根据用户地区、运营商、目标地区和业务类型查看定性线路经验；不采集实时线路数据，不输出质量评分或商家排名。",
  },
  en: {
    title:
      "Carrier route experience: understand route choices by region and workload",
    description:
      "Review qualitative carrier route experience by user region, carrier, destination, and workload without live measurement or provider ranking.",
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

export default async function NetworkLinesPage() {
  const ruleSet = await getPublishedNetworkExperienceRuleSnapshot();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language="zh" />
      <NetworkLineSelector language="zh" ruleSet={ruleSet} />
      <Footer language="zh" />
    </div>
  );
}
