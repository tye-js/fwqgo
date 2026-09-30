import Link from "@/features/public/components/public-link";
import { ArrowRight, SlidersHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { publicRegionLabel } from "@/features/public/lib/public-region-label";

type TagContextOffer = {
  providerName: string | null;
  region: string | null;
  /** 地区字典英文名。英文页的 chip 文字用它，跳转 query 仍用原文。 */
  regionEnName?: string | null;
  lineType: string | null;
};

/**
 * 侧栏 chip 的候选词。
 *
 * `query` 必须用**原文**：`/servers?query=` 按字典名或原文匹配
 * （见 `public-inventory-query.ts`），英文名匹配不到任何套餐。
 * `label` 才是屏幕上的文字 —— 英文页把地区换成字典英文名，否则英文标签页的 chip
 * 上会出现中文地区名（实测「荷兰」「德国」）。
 */
type TagContextTerm = { query: string; label: string };

function uniqueTerms(
  offers: TagContextOffer[],
  language: "zh" | "en",
): TagContextTerm[] {
  const seen = new Set<string>();
  const terms: TagContextTerm[] = [];

  for (const offer of offers) {
    const candidates: Array<[string | null, string | null]> = [
      [offer.providerName, offer.providerName],
      [offer.region, publicRegionLabel(offer, language)],
      [offer.lineType, offer.lineType],
    ];

    for (const [rawQuery, rawLabel] of candidates) {
      const query = rawQuery?.trim();
      const label = rawLabel?.trim();
      if (!query || !label || seen.has(query)) continue;
      seen.add(query);
      terms.push({ query, label });
      if (terms.length >= 6) return terms;
    }
  }

  return terms;
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
  const terms = uniqueTerms(offers, language);
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
          <SlidersHorizontal
            className="size-4 text-primary"
            aria-hidden="true"
          />
          {copy.title}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {copy.description}
        </p>
        {terms.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {terms.map((term) => (
              <Link
                key={term.query}
                href={`/servers?query=${encodeURIComponent(term.query)}`}
                prefetch={false}
                className="inline-flex min-h-11 items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 xl:min-h-8"
              >
                <Badge
                  variant="secondary"
                  className="min-h-8 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  {term.label}
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
