import { getPublishedPostCount } from "@/features/public/data/post";
import type { Metadata } from "next";
import { Suspense } from "react";

import {
  AllArticlesPageContent,
  resolveAllArticlesPage,
} from "@/features/public/components/all-articles-page";

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_URL ?? "https://fwqgo.com").replace(
    /\/+$/,
    "",
  );
}

export async function generateMetadata(props: {
  params: Promise<{ pageNo: string }>;
}): Promise<Metadata> {
  const { pageNo, totalCount } = await resolveAllArticlesPage(
    props.params,
    "zh",
  );
  const { data: siblingCount } = await getPublishedPostCount("en");
  const canonical = `${getSiteUrl()}/fwq/page/${pageNo}`;
  const chineseUrl = `${getSiteUrl()}/fwq/page/${pageNo}`;
  const englishUrl = `${getSiteUrl()}/en/fwq/page/${pageNo}`;
  const languages =
    pageNo === 1 && totalCount > 0 && siblingCount > 0
      ? { "zh-CN": chineseUrl, en: englishUrl, "x-default": chineseUrl }
      : undefined;

  return {
    title: "全部文章 - 服务器go",
    description: "浏览服务器go全部服务器优惠、测评和选购指南。",
    robots: { index: pageNo === 1 && totalCount > 0, follow: true },
    alternates: {
      canonical,
      languages,
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
