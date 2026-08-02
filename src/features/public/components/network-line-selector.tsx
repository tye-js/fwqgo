"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Network } from "lucide-react";

import {
  matchNetworkExperience,
  NETWORK_ACCESS_TYPES,
  NETWORK_DESTINATION_REGIONS,
  NETWORK_WORKLOADS,
  type NetworkExperienceInputV1,
  type NetworkExperienceRuleSetSnapshot,
} from "@fwqgo/core/network-experience";
import { Button } from "@/components/ui/button";

type Language = "zh" | "en";

const regionOptions: Array<{ value: NetworkExperienceInputV1["userRegion"]; zh: string; en: string }> = [
  { value: "north_china", zh: "华北", en: "North China" },
  { value: "east_china", zh: "华东", en: "East China" },
  { value: "south_china", zh: "华南", en: "South China" },
  { value: "southwest_china", zh: "西南", en: "Southwest China" },
  { value: "northeast_china", zh: "东北", en: "Northeast China" },
  { value: "northwest_china", zh: "西北", en: "Northwest China" },
];

const reasonLabels: Record<string, { zh: string; en: string }> = {
  provider_label_may_not_match_delivered_route: { zh: "商家标签不等于实际交付路由", en: "Provider labels may not match the delivered route" },
  return_path_may_differ: { zh: "去程和回程可能不对称", en: "Forward and return paths may differ" },
  province_and_access_type_can_change_result: { zh: "省份和接入类型可能改变实际结果", en: "Province and access type can change the result" },
  peak_hour_congestion_requires_testing: { zh: "晚高峰拥塞需要自行验证", en: "Peak-hour congestion requires your own test" },
  optimized_route_is_not_bandwidth_guarantee: { zh: "优化线路不代表带宽或流量保证", en: "An optimized route is not a bandwidth guarantee" },
  cross_carrier_behavior_is_not_guaranteed: { zh: "跨运营商表现不作保证", en: "Cross-carrier behavior is not guaranteed" },
  physical_distance_still_limits_realtime_use: { zh: "物理距离仍会限制实时交互体验", en: "Physical distance still limits real-time use" },
  no_published_rule: { zh: "当前没有可用的已发布经验规则", en: "No published experience rule is available" },
  no_matching_rule: { zh: "当前条件没有匹配规则", en: "No rule matches these conditions" },
  conflicting_rules_at_same_specificity: { zh: "同一精确度存在冲突规则，不能硬凑结论", en: "Conflicting rules prevent a definitive conclusion" },
  additional_matching_rules_hidden: { zh: "还有更多规则未展开", en: "Additional matching rules are hidden" },
  request_test_ip_and_looking_glass: { zh: "购买前索取测试 IP 或 Looking Glass", en: "Request a test IP or Looking Glass before purchase" },
  confirm_test_ip_matches_delivery_prefix: { zh: "确认测试 IP 与交付机房和前缀一致", en: "Confirm the test IP matches the delivery site and prefix" },
  run_ping_mtr_and_traceroute: { zh: "用自己的网络执行 ping、MTR 或 traceroute", en: "Run ping, MTR, or traceroute from your own network" },
  test_tcp_tls_and_real_request: { zh: "测试 TCP/TLS 建连和真实业务请求", en: "Test TCP/TLS setup and a real request" },
  repeat_during_peak_hours: { zh: "覆盖工作时段和晚高峰复测", en: "Repeat tests during working hours and peak hours" },
  test_with_each_relevant_carrier: { zh: "分别使用相关运营商测试", en: "Test separately with each relevant carrier" },
};

const copy = {
  zh: {
    eyebrow: "线路经验速查",
    title: "按运营商和业务场景了解线路选择",
    intro: "这是基于过往运维经验的定性判断，不是实时测速、质量评分或商家排名。具体服务器请使用自己的网络完成购买前后测试。",
    userRegion: "用户地区",
    carrier: "运营商",
    access: "接入类型",
    destination: "目标地区",
    workload: "业务类型",
    submit: "查看经验建议",
    boundary: "规则版本和复核日期会随内容发布更新；规则缺失或冲突时会明确显示未知。",
    unknown: "经验不足，先按测试清单验证",
    partial: "部分运营商有经验建议",
    matched: "已匹配经验建议",
    noRules: "暂无已发布规则。可以先阅读测试指南并向商家索取测试信息。",
    strengths: "为什么可能适合",
    risks: "风险与边界",
    verify: "验证清单",
    basis: "经验依据",
    preferred: "通常优先关注",
    situational: "视条件选择",
    notPreferred: "通常不优先",
    established: "长期共识",
    common: "常见经验",
    limited: "有限经验",
    testGuide: "购买前后都不要跳过单服务器测试。",
  },
  en: {
    eyebrow: "Route experience guide",
    title: "Understand route choices by carrier and workload",
    intro: "This is a qualitative guide based on operating experience, not live measurement, quality scoring, or provider ranking. Test the exact server from your own networks before and after purchase.",
    userRegion: "User region",
    carrier: "Carrier",
    access: "Access type",
    destination: "Destination",
    workload: "Workload",
    submit: "View experience",
    boundary: "Rule versions and review dates change with publication; missing or conflicting rules stay visibly unknown.",
    unknown: "Insufficient experience; start with the test checklist",
    partial: "Experience is available for some carriers",
    matched: "Experience suggestions matched",
    noRules: "No published rules are available. Read the test guide and request test information from the provider.",
    strengths: "Why it may fit",
    risks: "Risks and boundaries",
    verify: "Verification checklist",
    basis: "Evidence strength",
    preferred: "Usually worth prioritizing",
    situational: "Situational",
    notPreferred: "Usually not first choice",
    established: "Established",
    common: "Common experience",
    limited: "Limited experience",
    testGuide: "Do not skip exact-server testing before and after purchase.",
  },
} as const;

const initialInput: NetworkExperienceInputV1 = {
  schemaVersion: 1,
  userRegion: "east_china",
  carrier: "multi_carrier",
  accessType: "residential",
  destinationRegion: "hong_kong",
  workload: "web_api",
};

const labels: Record<string, { zh: string; en: string }> = {
  telecom: { zh: "电信", en: "Telecom" },
  unicom: { zh: "联通", en: "Unicom" },
  mobile: { zh: "移动", en: "Mobile" },
  multi_carrier: { zh: "三网用户", en: "Multi-carrier" },
  residential: { zh: "家庭宽带", en: "Residential" },
  business: { zh: "企业网络", en: "Business" },
  mobile_access: { zh: "移动网络", en: "Mobile network" },
  unknown: { zh: "未知", en: "Unknown" },
  hong_kong: { zh: "香港", en: "Hong Kong" },
  japan: { zh: "日本", en: "Japan" },
  singapore: { zh: "新加坡", en: "Singapore" },
  us_west: { zh: "美国西部", en: "US West" },
  other: { zh: "其他", en: "Other" },
  web_api: { zh: "网站 / API", en: "Web / API" },
  realtime: { zh: "实时交互", en: "Real-time" },
  download: { zh: "下载分发", en: "Download" },
  background: { zh: "后台任务", en: "Background" },
};

function reason(code: string, language: Language) {
  return reasonLabels[code]?.[language] ?? code.replaceAll("_", " ");
}

export function NetworkLineSelector({ language, ruleSet }: { language: Language; ruleSet: NetworkExperienceRuleSetSnapshot | null }) {
  const text = copy[language];
  const [input, setInput] = useState(initialInput);
  const [submitted, setSubmitted] = useState(false);
  const result = useMemo(() => (submitted ? matchNetworkExperience(input, ruleSet) : null), [input, ruleSet, submitted]);
  const statusText = result?.status === "matched" ? text.matched : result?.status === "partial" ? text.partial : text.unknown;

  function update<K extends keyof NetworkExperienceInputV1>(key: K, value: NetworkExperienceInputV1[K]) {
    setInput((current) => ({ ...current, [key]: value }));
    setSubmitted(false);
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-sm font-medium text-primary"><Network className="size-4" aria-hidden="true" /><span>{text.eyebrow}</span></div>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">{text.title}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{text.intro}</p>
      </div>

      <form className="mt-8 grid gap-4 rounded-lg border border-border/70 bg-card p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-3" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
        <Field label={text.userRegion}><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={input.userRegion} onChange={(event) => update("userRegion", event.target.value as NetworkExperienceInputV1["userRegion"])}>{regionOptions.map((item) => <option key={item.value} value={item.value}>{item[language]}</option>)}</select></Field>
        <Field label={text.carrier}><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={input.carrier} onChange={(event) => update("carrier", event.target.value as NetworkExperienceInputV1["carrier"])}>{["multi_carrier", "telecom", "unicom", "mobile"].map((value) => <option key={value} value={value}>{labels[value]![language]}</option>)}</select></Field>
        <Field label={text.access}><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={input.accessType} onChange={(event) => update("accessType", event.target.value as NetworkExperienceInputV1["accessType"])}>{NETWORK_ACCESS_TYPES.map((value) => <option key={value} value={value}>{labels[value === "mobile" ? "mobile_access" : value]![language]}</option>)}</select></Field>
        <Field label={text.destination}><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={input.destinationRegion} onChange={(event) => update("destinationRegion", event.target.value as NetworkExperienceInputV1["destinationRegion"])}>{NETWORK_DESTINATION_REGIONS.map((value) => <option key={value} value={value}>{labels[value]![language]}</option>)}</select></Field>
        <Field label={text.workload}><select className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={input.workload} onChange={(event) => update("workload", event.target.value as NetworkExperienceInputV1["workload"])}>{NETWORK_WORKLOADS.map((value) => <option key={value} value={value}>{labels[value]![language]}</option>)}</select></Field>
        <div className="flex items-end"><Button className="h-11 w-full" type="submit">{text.submit}</Button></div>
      </form>

      <div className="mt-4 rounded-md border-l-2 border-primary bg-muted/40 px-4 py-3 text-sm text-muted-foreground"><strong className="font-medium text-foreground">{text.boundary}</strong></div>

      {result ? <section className="mt-8 space-y-6" aria-live="polite">
        <div className="flex items-center gap-2 text-sm font-medium"><StatusIcon status={result.status} />{statusText}</div>
        {result.status === "rule_unavailable" ? <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">{text.noRules}</p> : null}
        <div className="grid gap-5 lg:grid-cols-3">
          {result.carrierResults.map((carrierResult) => <article key={carrierResult.carrier} className="rounded-lg border border-border/70 bg-card p-5">
            <h2 className="text-base font-semibold">{labels[carrierResult.carrier]![language]}</h2>
            {carrierResult.suggestions.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{carrierResult.unresolvedCodes.map((code) => reason(code, language)).join("；")}</p> : <div className="mt-4 space-y-4">
              {carrierResult.suggestions.map((suggestion) => <div key={suggestion.networkLineSlug} className="border-t border-border/70 pt-4 first:border-0 first:pt-0">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-medium">{language === "en" ? suggestion.networkLineEnName ?? suggestion.networkLineName ?? suggestion.networkLineSlug : suggestion.networkLineName ?? suggestion.networkLineSlug}</h3><p className="mt-1 text-xs text-muted-foreground">{suggestion.fit === "usually_preferred" ? text.preferred : suggestion.fit === "situational" ? text.situational : text.notPreferred} · {suggestion.basisStrength === "established" ? text.established : suggestion.basisStrength === "common" ? text.common : text.limited}</p></div></div>
                <p className="mt-3 text-xs font-medium text-muted-foreground">{text.strengths}</p><ul className="mt-1 list-disc space-y-1 pl-4 text-sm">{suggestion.advantageCodes.map((code) => <li key={code}>{reason(code, language)}</li>)}</ul>
                <p className="mt-3 text-xs font-medium text-muted-foreground">{text.risks}</p><ul className="mt-1 list-disc space-y-1 pl-4 text-sm">{suggestion.riskCodes.map((code) => <li key={code}>{reason(code, language)}</li>)}</ul>
              </div>)}
            </div>}
          </article>)}
        </div>
        <div className="grid gap-5 lg:grid-cols-2"><InfoList title={text.risks} codes={result.globalRiskCodes} language={language} /><InfoList title={text.verify} codes={result.verificationChecklistCodes} language={language} /></div>
        <p className="text-sm text-muted-foreground">{text.testGuide} {result.versions.ruleSetVersion !== "unavailable" ? `${result.versions.ruleSetVersion}${result.versions.reviewDueAt ? ` · ${new Date(result.versions.reviewDueAt).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US")}` : ""}` : ""}</p>
      </section> : null}
    </main>
  );
}

function InfoList({ title, codes, language }: { title: string; codes: string[]; language: Language }) {
  return <div className="rounded-lg border border-border/70 bg-card p-5"><h2 className="text-sm font-semibold">{title}</h2><ul className="mt-3 list-disc space-y-2 pl-4 text-sm">{codes.map((code) => <li key={code}>{reason(code, language)}</li>)}</ul></div>;
}

function StatusIcon({ status }: { status: "matched" | "partial" | "unknown" | "rule_unavailable" }) {
  if (status === "matched") return <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />;
  if (status === "partial") return <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />;
  return <HelpCircle className="size-4 text-muted-foreground" aria-hidden="true" />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1.5 text-sm font-medium"><span>{label}</span>{children}</label>;
}
