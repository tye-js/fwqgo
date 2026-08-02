"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Network,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  NETWORK_REGION_CODES,
  type NetworkRecommendationRequestV1,
} from "@fwqgo/core/network-assessment";
import {
  requestNetworkRecommendation,
  type NetworkRecommendationResponseV1,
} from "@/features/public/data/network-assessment";

type Language = "zh" | "en";

const regionLabels: Record<
  (typeof NETWORK_REGION_CODES)[number],
  { zh: string; en: string }
> = {
  north_china: { zh: "华北", en: "North China" },
  east_china: { zh: "华东", en: "East China" },
  south_china: { zh: "华南", en: "South China" },
  southwest_china: { zh: "西南", en: "Southwest China" },
  hong_kong: { zh: "香港", en: "Hong Kong" },
  japan: { zh: "日本", en: "Japan" },
  singapore: { zh: "新加坡", en: "Singapore" },
  us_west: { zh: "美国西部", en: "US West" },
};

const copy = {
  zh: {
    eyebrow: "运营商线路评估",
    title: "按用户地区和运营商权重查看线路证据",
    intro:
      "只比较已经发布的 IPv4 评估快照。缺少双向、晚高峰或独立探针证据时，页面会明确显示暂无推荐。",
    userRegion: "用户地区",
    destination: "目标机房地区",
    access: "接入类型",
    workload: "业务类型",
    balance: "排序方式",
    submit: "查看评估",
    loading: "读取已发布评估…",
    privacy: "只提交地区、受控枚举和运营商权重，不提交 IP、域名或业务名称。",
    status: {
      ok: "已有符合门槛的候选",
      insufficient: "证据不足，暂不做推荐",
      unavailable: "当前范围暂无已发布评估",
    },
    carrier: "运营商权重",
    carrierNames: { telecom: "电信", unicom: "联通", mobile: "移动" },
    weighted: "按权重",
    balanced: "三网最弱项优先",
    accessValues: {
      residential: "家庭宽带",
      business: "企业网络",
      mobile: "移动网络",
      unknown: "未知",
    },
    workloadValues: {
      web_api: "网站 / API",
      realtime: "实时交互",
      download: "下载分发",
      background: "后台任务",
    },
    noData: "没有可公开的快照。先完成七天双向测量和人工发布，再开放推荐。",
    freshness: "新鲜度",
    score: "质量",
    confidence: "置信度",
    coverage: "覆盖",
    evidence: "证据",
    recommended: "推荐候选",
    candidate: "可比较",
    insufficient: "证据不足",
    active: "有效",
    withdrawn: "已撤销",
    expired: "已过期",
    aging: "需复测",
    fresh: "近期",
    validation: "购买后验收",
    validationItems: "核对同前缀、双向晚高峰复测",
  },
  en: {
    eyebrow: "Carrier route assessment",
    title: "Compare route evidence for your carrier mix",
    intro:
      "Only published IPv4 assessment snapshots are compared. Missing bidirectional, peak-hour, or independent-probe evidence stays visible as no recommendation.",
    userRegion: "User region",
    destination: "Destination region",
    access: "Access type",
    workload: "Workload",
    balance: "Ranking",
    submit: "View assessment",
    loading: "Loading published assessments…",
    privacy:
      "Only regions, controlled enums, and carrier weights are submitted. No IP, domain, or business name is sent.",
    status: {
      ok: "Qualified candidates are available",
      insufficient: "Evidence is insufficient for a recommendation",
      unavailable: "No published assessment exists for this scope",
    },
    carrier: "Carrier weights",
    carrierNames: { telecom: "Telecom", unicom: "Unicom", mobile: "Mobile" },
    weighted: "Weighted",
    balanced: "Weakest-carrier first",
    accessValues: {
      residential: "Residential",
      business: "Business",
      mobile: "Mobile",
      unknown: "Unknown",
    },
    workloadValues: {
      web_api: "Web / API",
      realtime: "Real-time",
      download: "Download",
      background: "Background",
    },
    noData:
      "No public snapshot is available. A seven-day bidirectional measurement and manual publication are required before recommendations can appear.",
    freshness: "Freshness",
    score: "Quality",
    confidence: "Confidence",
    coverage: "Coverage",
    evidence: "Evidence",
    recommended: "Recommended",
    candidate: "Comparable",
    insufficient: "Insufficient",
    active: "Active",
    withdrawn: "Withdrawn",
    expired: "Expired",
    aging: "Retest due",
    fresh: "Fresh",
    validation: "Post-purchase check",
    validationItems: "Confirm same prefix and repeat bidirectional peak tests",
  },
} as const;

type Carrier = keyof NetworkRecommendationRequestV1["carrierWeightsBps"];

const initialInput: NetworkRecommendationRequestV1 = {
  schemaVersion: 1,
  language: "zh",
  userRegionCode: "east_china",
  destinationRegionCode: "hong_kong",
  accessType: "residential",
  workload: "web_api",
  addressFamily: "ipv4",
  balanceMode: "weighted",
  carrierWeightsBps: { telecom: 3334, unicom: 3333, mobile: 3333 },
};

function percent(value: number | null) {
  return value === null ? "—" : `${(value / 100).toFixed(1)}%`;
}

export function NetworkLineSelector({ language }: { language: Language }) {
  const text = copy[language];
  const [input, setInput] = useState<NetworkRecommendationRequestV1>({
    ...initialInput,
    language,
  });
  const [result, setResult] = useState<NetworkRecommendationResponseV1 | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalWeight = useMemo(
    () =>
      Object.values(input.carrierWeightsBps).reduce(
        (sum, value) => sum + value,
        0,
      ),
    [input.carrierWeightsBps],
  );

  function updateCarrier(carrier: Carrier, value: string) {
    const parsed = Number(value);
    setInput((current) => ({
      ...current,
      carrierWeightsBps: {
        ...current.carrierWeightsBps,
        [carrier]: Number.isFinite(parsed) ? parsed : 0,
      },
    }));
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      setResult(await requestNetworkRecommendation(input));
    } catch {
      setError(
        language === "zh"
          ? "评估暂时不可用，请稍后重试。"
          : "The assessment is temporarily unavailable. Try again later.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Network className="size-4" aria-hidden="true" />
          <span>{text.eyebrow}</span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">
          {text.title}
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          {text.intro}
        </p>
      </div>

      <form
        className="mt-8 grid gap-6 rounded-lg border border-border/70 bg-card p-5 shadow-sm lg:grid-cols-[1fr_1fr]"
        onSubmit={(event) => {
          event.preventDefault();
          if (totalWeight === 10_000) void submit();
        }}
      >
        <Field label={text.userRegion}>
          <select
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={input.userRegionCode}
            onChange={(event) =>
              setInput({
                ...input,
                userRegionCode: event.target
                  .value as NetworkRecommendationRequestV1["userRegionCode"],
              })
            }
          >
            {NETWORK_REGION_CODES.map((region) => (
              <option key={region} value={region}>
                {regionLabels[region][language]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={text.destination}>
          <select
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={input.destinationRegionCode}
            onChange={(event) =>
              setInput({
                ...input,
                destinationRegionCode: event.target
                  .value as NetworkRecommendationRequestV1["destinationRegionCode"],
              })
            }
          >
            {NETWORK_REGION_CODES.map((region) => (
              <option key={region} value={region}>
                {regionLabels[region][language]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={text.access}>
          <select
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={input.accessType}
            onChange={(event) =>
              setInput({
                ...input,
                accessType: event.target
                  .value as NetworkRecommendationRequestV1["accessType"],
              })
            }
          >
            {(
              Object.keys(text.accessValues) as Array<
                NetworkRecommendationRequestV1["accessType"]
              >
            ).map((value) => (
              <option key={value} value={value}>
                {text.accessValues[value]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={text.workload}>
          <select
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={input.workload}
            onChange={(event) =>
              setInput({
                ...input,
                workload: event.target
                  .value as NetworkRecommendationRequestV1["workload"],
              })
            }
          >
            {(
              Object.keys(text.workloadValues) as Array<
                NetworkRecommendationRequestV1["workload"]
              >
            ).map((value) => (
              <option key={value} value={value}>
                {text.workloadValues[value]}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="lg:col-span-2">
          <legend className="mb-2 text-sm font-medium">
            {text.carrier}{" "}
            <span
              className={
                totalWeight === 10_000
                  ? "text-muted-foreground"
                  : "text-destructive"
              }
            >
              ({totalWeight}/10000)
            </span>
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(input.carrierWeightsBps) as Carrier[]).map(
              (carrier) => (
                <label
                  key={carrier}
                  className="grid gap-1.5 text-sm text-muted-foreground"
                >
                  <span>{text.carrierNames[carrier]}</span>
                  <input
                    className="h-11 rounded-md border border-input bg-background px-3 text-foreground"
                    inputMode="numeric"
                    min={0}
                    max={10000}
                    step={1}
                    type="number"
                    value={input.carrierWeightsBps[carrier]}
                    onChange={(event) =>
                      updateCarrier(carrier, event.target.value)
                    }
                  />
                </label>
              ),
            )}
          </div>
        </fieldset>
        <Field label={text.balance}>
          <select
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={input.balanceMode}
            onChange={(event) =>
              setInput({
                ...input,
                balanceMode: event.target
                  .value as NetworkRecommendationRequestV1["balanceMode"],
              })
            }
          >
            <option value="weighted">{text.weighted}</option>
            <option value="three_carrier_balanced">{text.balanced}</option>
          </select>
        </Field>
        <div className="flex items-end lg:justify-end">
          <Button
            className="min-h-11 w-full gap-2 lg:w-auto"
            disabled={loading || totalWeight !== 10_000}
            type="submit"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-4" aria-hidden="true" />
            )}
            {loading ? text.loading : text.submit}
          </Button>
        </div>
        <p className="flex gap-2 text-xs leading-5 text-muted-foreground lg:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {text.privacy}
        </p>
      </form>

      {error ? (
        <div
          className="mt-6 flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
          role="alert"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      ) : null}
      {result ? (
        <AssessmentResults language={language} result={result} text={text} />
      ) : null}
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}

function AssessmentResults({
  language,
  result,
  text,
}: {
  language: Language;
  result: NetworkRecommendationResponseV1;
  text: (typeof copy)[Language];
}) {
  return (
    <section className="mt-8" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <h2 className="text-xl font-semibold">
          {text.status[result.resultStatus]}
        </h2>
        <span className="text-xs text-muted-foreground">
          {result.formulaVersion} · {result.generatedAt.slice(0, 10)}
        </span>
      </div>
      {result.candidates.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">
          {text.noData}
        </p>
      ) : (
        <div className="mt-5 grid gap-4">
          {result.candidates.map((candidate) => {
            const stateLabel =
              candidate.recommendationState === "recommended"
                ? text.recommended
                : candidate.recommendationState === "candidate"
                  ? text.candidate
                  : text.insufficient;
            const freshnessLabel =
              candidate.freshness === "fresh"
                ? text.fresh
                : candidate.freshness === "aging"
                  ? text.aging
                  : candidate.freshness === "expired"
                    ? text.expired
                    : "—";
            return (
              <article
                key={candidate.slug}
                className="rounded-lg border border-border/70 bg-card p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {language === "en" && candidate.enName
                        ? candidate.enName
                        : candidate.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {candidate.slug}
                    </p>
                  </div>
                  <span className="rounded-sm bg-muted px-2.5 py-1 text-xs font-medium">
                    {stateLabel}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                  <Metric
                    label={text.score}
                    value={percent(candidate.qualityScoreBps)}
                  />
                  <Metric
                    label={text.confidence}
                    value={percent(candidate.confidenceBps)}
                  />
                  <Metric
                    label={text.coverage}
                    value={percent(candidate.coverageBps)}
                  />
                  <Metric
                    label={text.evidence}
                    value={candidate.evidenceGrade ?? "—"}
                  />
                  <Metric label={text.freshness} value={freshnessLabel} />
                </div>
                {candidate.recommendationState === "insufficient" &&
                candidate.missingCells.length > 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    {candidate.missingCells.slice(0, 4).join(" · ")}
                  </p>
                ) : null}
                <div className="mt-4 rounded-md border-l-2 border-primary bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
                  <strong className="font-medium text-foreground">
                    {text.validation}：
                  </strong>
                  {text.validationItems}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
