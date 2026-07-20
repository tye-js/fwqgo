import type { Metadata } from "next";
import { Suspense } from "react";

import { AllArticlesPageContent } from "@/features/public/components/all-articles-page";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export async function generateMetadata(props: {
  params: Promise<{ pageNo: string }>;
}): Promise<Metadata> {
  const { pageNo } = await props.params;
  const canonical = `${getSiteUrl()}/fwq/page/${encodeURIComponent(pageNo)}`;
  const englishUrl = `${getSiteUrl()}/en/fwq/page/${encodeURIComponent(pageNo)}`;

  return {
    title: "全部文章 - 服务器go",
    description: "浏览服务器go全部服务器优惠、测评和选购指南。",
    alternates: {
      canonical,
      languages: {
        "zh-CN": canonical,
        en: englishUrl,
        "x-default": canonical,
      },
    },
    openGraph: {
      title: "全部文章 - 服务器go",
      description: "浏览服务器go全部服务器优惠、测评和选购指南。",
      url: canonical,
      siteName: "服务器go",
    },
  };
}

export default function AllArticlesPage(props: {
  params: Promise<{ pageNo: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-6 text-sm text-muted-foreground">
          正在加载文章...
        </div>
      }
    >
      <AllArticlesPageContent paramsPromise={props.params} />
    </Suspense>
  );
}
