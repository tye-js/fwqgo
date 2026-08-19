import type { Metadata } from "next";
import { Suspense } from "react";

import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { ServerSizingCalculator } from "@/features/public/components/server-sizing-calculator";
import { getPublishedServerSizingRuleSnapshot } from "@/features/public/data/server-sizing";
import type { PublicKnowledgeLanguage } from "@/features/public/data/knowledge";

const copy = {
  zh: {
    title: "服务器配置估算器：按项目规模计算 VPS 资源",
    description:
      "根据峰值 RPS、数据增长、RPO/RTO 和批处理任务，估算服务器 CPU、内存、存储、网络与副本范围。",
  },
  en: {
    title: "Server sizing calculator: estimate resources from workload scale",
    description:
      "Estimate CPU, memory, storage, network, and replicas from peak RPS, data growth, RPO/RTO, and batch workloads.",
  },
} as const;

function siteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export function buildServerSizingMetadata(
  language: PublicKnowledgeLanguage,
): Metadata {
  const text = copy[language];
  const pathname =
    language === "en" ? "/en/tools/server-sizing" : "/tools/server-sizing";
  return {
    title: text.title,
    description: text.description,
    alternates: {
      canonical: `${siteUrl()}${pathname}`,
      languages: {
        "zh-CN": `${siteUrl()}/tools/server-sizing`,
        en: `${siteUrl()}/en/tools/server-sizing`,
        "x-default": `${siteUrl()}/tools/server-sizing`,
      },
    },
    robots: { index: true, follow: true },
  };
}

export function generateMetadata(): Metadata {
  return buildServerSizingMetadata("zh");
}

export default async function ServerSizingPage({
  language = "zh",
}: {
  language?: PublicKnowledgeLanguage;
}) {
  const rules = await getPublishedServerSizingRuleSnapshot();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Header language={language} />
      <Suspense fallback={<div className="min-h-[60vh]" />}>
        <ServerSizingCalculator
          language={language}
          ruleSet={rules}
          ruleVersion={rules?.versionLabel ?? "rule-unavailable"}
        />
      </Suspense>
      <Footer language={language} />
    </div>
  );
}
