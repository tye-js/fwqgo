import { AlertTriangle, CheckCircle2, CircleHelp, XCircle } from "lucide-react";

import {
  evaluateServerOfferCollection,
  type ServerFitOffer,
  type SuitabilityFit,
  type SuitabilityScenario,
} from "@fwqgo/core/server-fit";

type OfferLike = Partial<ServerFitOffer>;

type RecommendationLanguage = "zh" | "en";

const scenarios: SuitabilityScenario[] = [
  "mainland_web_api",
  "overseas_web_api",
  "mixed_audience",
  "remote_ai_development",
  "ai_api_backend",
  "self_hosted_streaming",
  "third_party_streaming_access",
  "dev_test",
];

const copy = {
  zh: {
    title: "本页整表适配结论",
    intro:
      "下面结论只根据本页套餐已填写的地区、线路和结构化配置，使用审核过的经验规则生成；不采集实时线路，也不代表性能或上游服务保证。",
    overall: "总体判断",
    suitable: "通常适合",
    conditional: "有条件适合",
    unsuitable: "通常不建议",
    insufficient: "信息不足",
    check: "下单前核对",
    missing: "缺少字段",
    scenarios: {
      mainland_web_api: "大陆用户网站 / API",
      overseas_web_api: "海外用户网站 / API",
      mixed_audience: "大陆 + 海外混合用户",
      remote_ai_development: "Codex / Claude Code 远程开发",
      ai_api_backend: "AI API / Agent 后端",
      transactional_ecommerce: "跨境电商与交易业务",
      realtime_service: "实时交互服务",
      large_transfer: "下载 / 备份 / 大流量传输",
      self_hosted_streaming: "自建流媒体",
      third_party_streaming_access: "访问第三方流媒体",
      dev_test: "开发测试 / 临时项目",
    },
    scopeFallback: "当前套餐表",
  },
  en: {
    title: "Whole-table suitability guidance",
    intro:
      "These conclusions use only the region, route, and structured specifications present in this table. They are reviewed experience rules, not live measurements, performance guarantees, or upstream-service guarantees.",
    overall: "Overall",
    suitable: "Usually suitable",
    conditional: "Conditional",
    unsuitable: "Usually not recommended",
    insufficient: "Insufficient data",
    check: "Check before ordering",
    missing: "Missing fields",
    scenarios: {
      mainland_web_api: "Mainland-China website / API",
      overseas_web_api: "Overseas website / API",
      mixed_audience: "Mixed mainland + overseas audience",
      remote_ai_development: "Remote Codex / Claude Code development",
      ai_api_backend: "AI API / Agent backend",
      transactional_ecommerce: "Cross-border commerce",
      realtime_service: "Real-time interactive service",
      large_transfer: "Downloads / backups / large transfers",
      self_hosted_streaming: "Self-hosted streaming",
      third_party_streaming_access: "Third-party streaming access",
      dev_test: "Development / testing / temporary projects",
    },
    scopeFallback: "this offer table",
  },
} as const;

function fitLabel(fit: SuitabilityFit, language: RecommendationLanguage) {
  const languageCopy = copy[language];
  return fit === "usually_suitable"
    ? languageCopy.suitable
    : fit === "conditional"
      ? languageCopy.conditional
      : fit === "usually_unsuitable"
        ? languageCopy.unsuitable
        : languageCopy.insufficient;
}

function FitIcon({ fit }: { fit: SuitabilityFit }) {
  if (fit === "usually_suitable")
    return <CheckCircle2 className="size-4" aria-hidden="true" />;
  if (fit === "usually_unsuitable")
    return <XCircle className="size-4" aria-hidden="true" />;
  if (fit === "conditional")
    return <AlertTriangle className="size-4" aria-hidden="true" />;
  return <CircleHelp className="size-4" aria-hidden="true" />;
}

function fitClass(fit: SuitabilityFit) {
  if (fit === "usually_suitable") {
    return "border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200";
  }
  if (fit === "usually_unsuitable") {
    return "border-destructive/30 bg-destructive/5 text-destructive";
  }
  if (fit === "conditional") {
    return "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200";
  }
  return "border-border bg-muted/30 text-muted-foreground";
}

function listItems(items: string[], className = "") {
  return items.length > 0 ? (
    <ul className={`space-y-1.5 text-sm leading-6 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          <span
            aria-hidden="true"
            className="mt-2 size-1.5 shrink-0 rounded-full bg-current"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  ) : null;
}

export function ServerFitRecommendation({
  offers,
  scopeKind,
  scopeLabel,
  language = "zh",
}: {
  offers: OfferLike[];
  scopeKind: "topic" | "region" | "line" | "provider" | "all";
  scopeLabel?: string | null;
  language?: RecommendationLanguage;
}) {
  const languageCopy = copy[language];
  const result = evaluateServerOfferCollection({
    offers: offers.map((offer) => ({
      region: offer.region ?? null,
      lineType: offer.lineType ?? null,
      productType: offer.productType ?? null,
      vcpuCount: offer.vcpuCount ?? null,
      memoryMb: offer.memoryMb ?? null,
      storageGb: offer.storageGb ?? null,
      storageType: offer.storageType ?? null,
      bandwidthMbps: offer.bandwidthMbps ?? null,
      trafficGb: offer.trafficGb ?? null,
      ipv4: offer.ipv4 ?? null,
      ipv6: offer.ipv6 ?? null,
    })),
    scopeKind,
    scopeLabel,
    scenarios,
  });
  const selectedRecommendations = result.recommendations.filter((item) =>
    scenarios.includes(item.scenario),
  );
  const scope = result.scopeLabel ?? languageCopy.scopeFallback;
  return (
    <section
      aria-labelledby="server-fit-recommendation-title"
      className="mt-5 rounded-xl border border-primary/20 bg-primary/[0.035] p-4 shadow-sm md:p-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h2
            id="server-fit-recommendation-title"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            {languageCopy.title}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {scope} · {languageCopy.intro}
          </p>
        </div>
        <div
          className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${fitClass(result.overallFit)}`}
        >
          <FitIcon fit={result.overallFit} />
          <span>
            {languageCopy.overall}：{fitLabel(result.overallFit, language)}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {selectedRecommendations.map((item) => {
          const scenarioTitle = languageCopy.scenarios[item.scenario];
          return (
            <article
              key={item.scenario}
              className="rounded-lg border border-border/70 bg-background p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium leading-6 text-foreground">
                  {scenarioTitle}
                </h3>
                <span
                  className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-semibold ${fitClass(item.fit)}`}
                >
                  <FitIcon fit={item.fit} />
                  {fitLabel(item.fit, language)}
                </span>
              </div>
              <div className="mt-3 space-y-3">
                {listItems(item.usuallySuitable)}
                {listItems(item.conditional, "text-muted-foreground")}
                {listItems(item.usuallyUnsuitable, "text-destructive")}
                {item.missingFields.length > 0 ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {languageCopy.missing}：
                    {item.missingFields.join(language === "zh" ? "、" : ", ")}
                  </p>
                ) : null}
                {item.checkBeforeOrder.length > 0 ? (
                  <div className="border-t border-border/60 pt-2.5">
                    <p className="text-xs font-semibold text-foreground">
                      {languageCopy.check}
                    </p>
                    {listItems(
                      item.checkBeforeOrder,
                      "mt-1 text-muted-foreground",
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
