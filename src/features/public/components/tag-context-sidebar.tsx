import Link from "next/link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type TagContextOffer = {
  providerName: string | null;
  region: string | null;
  lineType: string | null;
};

function uniqueTerms(offers: TagContextOffer[]) {
  return [
    ...new Set(
      offers
        .flatMap((offer) => [offer.providerName, offer.region, offer.lineType])
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ].slice(0, 6);
}

export function TagContextSidebar({
  offers,
  pageNo,
  totalPage,
  language = "zh",
}: {
  offers: TagContextOffer[];
  pageNo: number;
  totalPage: number;
  language?: "zh" | "en";
}) {
  const terms = uniqueTerms(offers);
  const copy =
    language === "en"
      ? {
          title: "Continue comparing",
          description:
            "Use the matched providers, regions, and networks to narrow the server comparison tool.",
          page: `Page ${pageNo} / ${Math.max(totalPage, 1)}`,
          all: "Open server comparison",
        }
      : {
          title: "继续筛选套餐",
          description: "按当前主题命中的商家、地区和线路继续进入服务器比价。",
          page: `第 ${pageNo} / ${Math.max(totalPage, 1)} 页`,
          all: "打开服务器比价",
        };

  return (
    <Card className="rounded-lg border-border/70 bg-background shadow-none">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
          {copy.title}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
        {terms.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {terms.map((term) => (
              <Link
                key={term}
                href={`/servers?query=${encodeURIComponent(term)}`}
                prefetch
                className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Badge
                  variant="secondary"
                  className="min-h-8 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  {term}
                </Badge>
              </Link>
            ))}
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
          <span className="text-xs tabular-nums text-muted-foreground">
            {copy.page}
          </span>
          <Link
            href="/servers"
            prefetch
            className="inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {copy.all}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
