import type { Metadata } from "next";
import { Suspense } from "react";

import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";
import { AllArticlesPageContent } from "@/features/public/components/all-articles-page";
import { Separator } from "@/components/ui/separator";

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
  const canonical = `${getSiteUrl()}/en/fwq/page/${encodeURIComponent(pageNo)}`;
  const chineseUrl = `${getSiteUrl()}/fwq/page/${encodeURIComponent(pageNo)}`;

  return {
    title: "All Articles - fwqgo",
    description: "Browse all fwqgo server deals, reviews, and buying guides.",
    alternates: {
      canonical,
      languages: {
        "zh-CN": chineseUrl,
        en: canonical,
        "x-default": chineseUrl,
      },
    },
    openGraph: {
      title: "All Articles - fwqgo",
      description: "Browse all fwqgo server deals, reviews, and buying guides.",
      url: canonical,
      siteName: "fwqgo",
    },
  };
}

export default function EnglishAllArticlesPage(props: {
  params: Promise<{ pageNo: string }>;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language="en" />
      <Separator />
      <main className="container mx-auto flex-1 py-6 md:py-8">
        <Suspense
          fallback={
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Loading articles...
            </div>
          }
        >
          <AllArticlesPageContent
            paramsPromise={props.params}
            language="en"
          />
        </Suspense>
      </main>
      <Separator className="mt-4" />
      <Footer language="en" />
    </div>
  );
}
