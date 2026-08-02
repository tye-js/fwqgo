"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Gauge,
  HardDrive,
  Info,
  Network,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculateServerSizing,
  PUBLISHED_SERVER_SIZING_RULE_SET,
  type ServerSizingInputV1,
  type ServerSizingResultV1,
  type ServerSizingRuleSet,
  type SizingPlan,
  type WorkloadKind,
} from "@fwqgo/core/server-sizing";
import type { PublicKnowledgeLanguage } from "@/features/public/data/knowledge";

type FormState = {
  workload: WorkloadKind;
  peakRps: string;
  averageResponseTimeMs: string;
  averageResponseBytes: string;
  dynamicRatio: string;
  edgeCacheHitRatio: string;
  liveDataGiB: string;
  monthlyGrowthGiB: string;
  horizonMonths: string;
  rpoMinutes: string;
  rtoMinutes: string;
  evidence: ServerSizingInputV1["measurements"]["evidence"];
  cpuMsPerRequest: string;
  peakAppRssGiB: string;
  jobsPerWindow: string;
  completionWindowMinutes: string;
  averageJobDurationSeconds: string;
  cpuSecondsPerJob: string;
  memoryGiBPerConcurrentJob: string;
  temporaryStorageGiBPerConcurrentJob: string;
  storageReadGiBPerJob: string;
  storageWriteGiBPerJob: string;
  networkIngressGiBPerJob: string;
  networkEgressGiBPerJob: string;
  retryRate: string;
  maxParallelism: string;
};

const initialForm: FormState = {
  workload: "api_saas",
  peakRps: "100",
  averageResponseTimeMs: "140",
  averageResponseBytes: "49152",
  dynamicRatio: "1",
  edgeCacheHitRatio: "0",
  liveDataGiB: "10",
  monthlyGrowthGiB: "1",
  horizonMonths: "12",
  rpoMinutes: "15",
  rtoMinutes: "60",
  evidence: "estimated",
  cpuMsPerRequest: "",
  peakAppRssGiB: "",
  jobsPerWindow: "100",
  completionWindowMinutes: "60",
  averageJobDurationSeconds: "30",
  cpuSecondsPerJob: "8",
  memoryGiBPerConcurrentJob: "0.25",
  temporaryStorageGiBPerConcurrentJob: "0.5",
  storageReadGiBPerJob: "0.05",
  storageWriteGiBPerJob: "0.02",
  networkIngressGiBPerJob: "0.01",
  networkEgressGiBPerJob: "0.01",
  retryRate: "0",
  maxParallelism: "",
};

const copy = {
  zh: {
    eyebrow: "服务器配置估算",
    title: "把业务规模转换成可验证的服务器起步方案",
    intro:
      "输入峰值流量、数据增长和可靠性目标，得到起步、推荐与高可用三档范围。没有压测证据时，结果会明确标为范围，而不是伪造精确规格。",
    privacy: "计算在当前浏览器完成，不上传或保存你的业务规模输入。",
    workload: "工作负载",
    traffic: "流量与响应",
    data: "数据与增长",
    reliability: "可靠性目标",
    evidence: "实测证据",
    advanced: "可选实测字段",
    batch: "批处理任务",
    workloadOptions: {
      static_content: "静态内容站",
      cms_crud: "CMS / 企业站",
      api_saas: "API / SaaS",
      ecommerce_transactional: "交易电商",
      batch_worker: "批处理 Worker",
      custom: "自定义工作负载",
    } satisfies Record<WorkloadKind, string>,
    peakRps: "峰值总 RPS",
    responseTime: "平均响应时间（毫秒）",
    responseBytes: "平均响应体（字节）",
    dynamicRatio: "动态请求比例",
    cacheHit: "边缘缓存命中率",
    liveData: "在线数据量（GiB）",
    monthlyGrowth: "月增长（GiB）",
    horizon: "规划周期（月）",
    rpo: "RPO（分钟）",
    rto: "RTO（分钟）",
    evidenceOptions: {
      unknown: "未知 / 没有实测",
      estimated: "人工估算",
      synthetic: "合成压测",
      production: "生产遥测",
    },
    cpuMs: "CPU 每请求耗时（毫秒）",
    appRss: "峰值应用 RSS（GiB）",
    batchJobs: "每个窗口任务数",
    batchWindow: "完成窗口（分钟）",
    jobDuration: "单任务时长（秒）",
    cpuSeconds: "单任务 CPU 秒数",
    jobMemory: "并发任务内存（GiB）",
    tempStorage: "并发任务临时盘（GiB）",
    storageRead: "单任务读取（GiB）",
    storageWrite: "单任务写入（GiB）",
    networkIngress: "单任务入口流量（GiB）",
    networkEgress: "单任务出口流量（GiB）",
    retryRate: "重试率",
    maxParallelism: "最大并行度（可选）",
    plans: {
      start: "起步",
      recommended: "推荐",
      ha: "高可用",
    },
    status: {
      ok: "可作为当前输入的计算结果",
      range_only: "证据不足，以下为范围结果",
      constraint_unsatisfied: "当前约束下没有可行容量",
      invalid_input: "请修正输入后重新计算",
      rule_unavailable: "规则版本不可用，暂不输出结果",
      unsupported: "该工作负载需要专项架构设计",
    },
    resource: {
      vcpu: "vCPU",
      memory: "内存",
      storage: "主存储",
      backup: "备份容量",
      network: "网络出口",
      replicas: "副本数",
      connections: "数据库连接",
    },
    bottlenecks: "主要瓶颈",
    triggers: "扩容触发器",
    assumptions: "计算假设",
    missing: "缺失证据",
    trace: "计算轨迹",
    checklist: "验证清单",
    recovery: "恢复演练",
    guidance: "输入提示",
    guidanceText:
      "先填业务峰值和数据增长；如果有压测结果，再补充 CPU 每请求耗时和峰值 RSS，结果会从范围逐步收敛。",
    reset: "重置输入",
    knowledge: "查看配置选型知识",
    noPlan: "当前没有可显示的规格方案。",
    noEvidence: "没有足够证据形成精确结果。",
    range: (min: number, max: number, unit: string) =>
      `${min.toLocaleString("zh-CN")}–${max.toLocaleString("zh-CN")} ${unit}`,
    exact: (value: number, unit: string) =>
      `${value.toLocaleString("zh-CN")} ${unit}`,
  },
  en: {
    eyebrow: "Server sizing",
    title: "Turn workload signals into a verifiable server plan",
    intro:
      "Enter peak traffic, data growth, and reliability goals to get start, recommended, and high-availability ranges. Missing load evidence stays visible as a range instead of becoming false precision.",
    privacy:
      "Calculation runs in this browser. Business-size inputs are not uploaded or stored.",
    workload: "Workload",
    traffic: "Traffic and response",
    data: "Data and growth",
    reliability: "Reliability goals",
    evidence: "Measurement evidence",
    advanced: "Optional measurements",
    batch: "Batch jobs",
    workloadOptions: {
      static_content: "Static content",
      cms_crud: "CMS / business site",
      api_saas: "API / SaaS",
      ecommerce_transactional: "Transactional commerce",
      batch_worker: "Batch worker",
      custom: "Custom workload",
    } satisfies Record<WorkloadKind, string>,
    peakRps: "Peak total RPS",
    responseTime: "Average response time (ms)",
    responseBytes: "Average response size (bytes)",
    dynamicRatio: "Dynamic request ratio",
    cacheHit: "Edge cache hit ratio",
    liveData: "Live data (GiB)",
    monthlyGrowth: "Monthly growth (GiB)",
    horizon: "Planning horizon (months)",
    rpo: "RPO (minutes)",
    rto: "RTO (minutes)",
    evidenceOptions: {
      unknown: "Unknown / no load test",
      estimated: "Estimated",
      synthetic: "Synthetic load test",
      production: "Production telemetry",
    },
    cpuMs: "CPU time per request (ms)",
    appRss: "Peak application RSS (GiB)",
    batchJobs: "Jobs per window",
    batchWindow: "Completion window (minutes)",
    jobDuration: "Average job duration (seconds)",
    cpuSeconds: "CPU seconds per job",
    jobMemory: "Memory per concurrent job (GiB)",
    tempStorage: "Temporary storage per concurrent job (GiB)",
    storageRead: "Storage read per job (GiB)",
    storageWrite: "Storage write per job (GiB)",
    networkIngress: "Network ingress per job (GiB)",
    networkEgress: "Network egress per job (GiB)",
    retryRate: "Retry rate",
    maxParallelism: "Maximum parallelism (optional)",
    plans: { start: "Start", recommended: "Recommended", ha: "HA" },
    status: {
      ok: "Result is usable for this input",
      range_only: "Evidence is incomplete; showing a range",
      constraint_unsatisfied: "No feasible capacity under these constraints",
      invalid_input: "Fix the highlighted inputs and calculate again",
      rule_unavailable: "Rule version unavailable; no result is shown",
      unsupported: "This workload needs a specialist architecture review",
    },
    resource: {
      vcpu: "vCPU",
      memory: "Memory",
      storage: "Primary storage",
      backup: "Backup capacity",
      network: "Network egress",
      replicas: "Replicas",
      connections: "DB connections",
    },
    bottlenecks: "Bottlenecks",
    triggers: "Scaling triggers",
    assumptions: "Assumptions",
    missing: "Missing evidence",
    trace: "Calculation trace",
    checklist: "Verification checklist",
    recovery: "Recovery drills",
    guidance: "Input guidance",
    guidanceText:
      "Start with peak traffic and data growth. Add CPU time per request and peak RSS from a load test to narrow the range.",
    reset: "Reset inputs",
    knowledge: "Read server sizing knowledge",
    noPlan: "No sizing plan is available for these inputs.",
    noEvidence: "There is not enough evidence for a precise result.",
    range: (min: number, max: number, unit: string) =>
      `${min.toLocaleString("en-US")}–${max.toLocaleString("en-US")} ${unit}`,
    exact: (value: number, unit: string) =>
      `${value.toLocaleString("en-US")} ${unit}`,
  },
} as const;

function parseOptional(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function buildInput(form: FormState): ServerSizingInputV1 {
  const input: ServerSizingInputV1 = {
    schemaVersion: 1,
    workload: { kind: form.workload },
    traffic: {
      peakRps: parseOptional(form.peakRps),
      averageResponseTimeMs: parseOptional(form.averageResponseTimeMs),
      averageResponseBytes: parseOptional(form.averageResponseBytes),
      dynamicRatio: parseOptional(form.dynamicRatio),
      edgeCacheHitRatio: parseOptional(form.edgeCacheHitRatio),
    },
    measurements: {
      evidence: form.evidence,
      cpuMsPerRequest: parseOptional(form.cpuMsPerRequest),
      peakAppRssGiB: parseOptional(form.peakAppRssGiB),
      representativeDataset:
        form.evidence === "synthetic" || form.evidence === "production",
      environmentMatchesProduction: form.evidence === "production",
    },
    data: {
      liveDataGiB: parseOptional(form.liveDataGiB) ?? Number.NaN,
      monthlyGrowthGiB: parseOptional(form.monthlyGrowthGiB),
      horizonMonths: parseOptional(form.horizonMonths) ?? Number.NaN,
      database: "postgresql",
    },
    reliability: {
      rpoMinutes: parseOptional(form.rpoMinutes) ?? Number.NaN,
      rtoMinutes: parseOptional(form.rtoMinutes) ?? Number.NaN,
    },
    operations: { managedServicesAllowed: true, skill: "basic" },
  };

  if (form.workload === "batch_worker") {
    input.batch = {
      jobsPerWindow: parseOptional(form.jobsPerWindow) ?? Number.NaN,
      completionWindowMinutes:
        parseOptional(form.completionWindowMinutes) ?? Number.NaN,
      averageJobDurationSeconds: parseOptional(form.averageJobDurationSeconds),
      cpuSecondsPerJob: parseOptional(form.cpuSecondsPerJob),
      memoryGiBPerConcurrentJob: parseOptional(form.memoryGiBPerConcurrentJob),
      temporaryStorageGiBPerConcurrentJob: parseOptional(
        form.temporaryStorageGiBPerConcurrentJob,
      ),
      storageReadGiBPerJob: parseOptional(form.storageReadGiBPerJob),
      storageWriteGiBPerJob: parseOptional(form.storageWriteGiBPerJob),
      networkIngressGiBPerJob: parseOptional(form.networkIngressGiBPerJob),
      networkEgressGiBPerJob: parseOptional(form.networkEgressGiBPerJob),
      retryRate: parseOptional(form.retryRate),
      maxParallelism: parseOptional(form.maxParallelism),
    };
  }
  return input;
}

function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0,
  step = "any",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  step?: number | "any";
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Calculator;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border/70 py-6 last:border-b-0">
      <div className="mb-4 flex items-center gap-2">
        <Icon className="size-4 text-primary" aria-hidden="true" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function StatusIcon({
  status,
}: {
  status: ServerSizingResultV1["status"];
}) {
  if (status === "ok") {
    return <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />;
  }
  if (status === "range_only") {
    return <Info className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />;
  }
  if (status === "invalid_input") {
    return <AlertTriangle className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />;
  }
  return <TriangleAlert className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />;
}

function ReasonList({
  title,
  items,
  language,
}: {
  title: string;
  items: Array<{ code: string }>;
  language: PublicKnowledgeLanguage;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
        {items.slice(0, 6).map((item) => (
          <li key={item.code} className="flex gap-2">
            <span
              className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70"
              aria-hidden="true"
            />
            <span>{formatReason(item.code, language)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatReason(code: string, language: PublicKnowledgeLanguage) {
  const labels: Record<string, { zh: string; en: string }> = {
    cpu_measurement_missing: {
      zh: "缺少 CPU 每请求耗时或压测断点",
      en: "CPU/request or load-test breakpoint is missing",
    },
    memory_measurement_missing: {
      zh: "缺少峰值 RSS 或并发内存特征",
      en: "Peak RSS or concurrent-memory evidence is missing",
    },
    response_size_measurement_missing: {
      zh: "缺少代表性的响应体大小",
      en: "Representative response size is missing",
    },
    batch_per_job_measurement_missing: {
      zh: "部分批处理单任务资源仍使用规则范围",
      en: "Some per-job batch resources use rule ranges",
    },
    batch_parallelism: {
      zh: "任务并行度决定 Worker 容量",
      en: "Worker capacity is limited by job parallelism",
    },
    batch_storage_io: {
      zh: "存储读写吞吐需要单独验证",
      en: "Storage read/write throughput needs separate validation",
    },
    cpu: { zh: "CPU 计算需求", en: "CPU demand" },
    memory: { zh: "内存工作集", en: "Memory working set" },
    database_connections: {
      zh: "数据库连接与查询",
      en: "Database connections and queries",
    },
    response_time_slo_breach: {
      zh: "响应时间 SLO 持续超标",
      en: "Response-time SLO remains above target",
    },
    cpu_utilization_sustained: {
      zh: "CPU 利用率持续超过 70%",
      en: "CPU utilization remains above 70%",
    },
    memory_utilization_sustained: {
      zh: "内存利用率持续超过 75%",
      en: "Memory utilization remains above 75%",
    },
    backup_restore_window_breach: {
      zh: "备份或恢复窗口无法满足目标",
      en: "Backup or restore window misses its target",
    },
    test_failover: { zh: "执行故障切换演练", en: "Run a failover drill" },
    test_restore_from_independent_backup: {
      zh: "从独立备份介质验证恢复",
      en: "Verify restore from independent backup",
    },
    run_representative_load_test: {
      zh: "使用代表性数据执行压测",
      en: "Run a load test with representative data",
    },
    verify_database_restore: {
      zh: "验证数据库恢复与数据完整性",
      en: "Verify database restore and data integrity",
    },
    verify_peak_network_capacity: {
      zh: "验证峰值网络容量与突发",
      en: "Verify peak network capacity and bursts",
    },
    replay_failed_batch_idempotently: {
      zh: "验证失败批次可幂等重放",
      en: "Verify failed batches can be replayed idempotently",
    },
    verify_dead_letter_path: {
      zh: "验证死信与人工处理路径",
      en: "Verify the dead-letter and operator path",
    },
    profile_defaults_used: {
      zh: "部分指标使用工作负载模板默认值",
      en: "Some metrics use workload profile defaults",
    },
    backup_is_separate_capacity: {
      zh: "备份容量不计入主盘可用空间",
      en: "Backup capacity is separate from primary disk",
    },
    batch_retry_rate_normalized: {
      zh: "重试率已纳入有效任务数",
      en: "Retry rate is included in effective jobs",
    },
    batch_profile_defaults_allowed: {
      zh: "批处理缺失字段使用规则范围",
      en: "Missing batch fields use audited rule ranges",
    },
    batch_parallelism_limit_exceeded: {
      zh: "所需并行度超过输入上限",
      en: "Required parallelism exceeds the supplied limit",
    },
  };
  return labels[code]?.[language] ?? code;
}

function planMetric(
  plan: SizingPlan,
  key: "vcpu" | "memoryGiB" | "primaryStorageGiB" | "backupStorageGiB",
  language: PublicKnowledgeLanguage,
) {
  const value = plan[key];
  const unit = key === "vcpu" ? "vCPU" : key === "memoryGiB" ? "GiB" : "GiB";
  const format = copy[language].range;
  return format(value.min, value.max, unit);
}

export function ServerSizingCalculator({
  language,
  ruleVersion,
  ruleSet,
}: {
  language: PublicKnowledgeLanguage;
  ruleVersion: string;
  ruleSet: ServerSizingRuleSet | null;
}) {
  const text = copy[language];
  const [form, setForm] = useState<FormState>(initialForm);
  const [planKey, setPlanKey] = useState<"start" | "recommended" | "ha">(
    "recommended",
  );
  const input = useMemo(() => buildInput(form), [form]);
  const result = useMemo(
    () =>
      calculateServerSizing(
        input,
        ruleSet ?? { ...PUBLISHED_SERVER_SIZING_RULE_SET, status: "retired" as const },
      ),
    [input, ruleSet],
  );
  const activePlan = result[planKey];

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setForm(initialForm);
    setPlanKey("recommended");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex-1">
        <section className="border-b border-border/70 bg-muted/20">
          <div className="container mx-auto px-4 py-10 md:py-14">
            <div className="max-w-4xl">
              <Badge variant="outline" className="gap-1.5 bg-background">
                <Calculator className="size-3.5" aria-hidden="true" />
                {text.eyebrow}
              </Badge>
              <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-normal md:text-4xl">
                {text.title}
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
                {text.intro}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck
                    className="size-4 text-primary"
                    aria-hidden="true"
                  />
                  {text.privacy}
                </span>
                <span className="rounded-sm bg-muted px-2 py-1 font-mono text-xs">
                  {ruleVersion}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="container mx-auto grid gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)] lg:items-start lg:py-10">
          <div className="rounded-lg border border-border/70 bg-background p-5 shadow-sm md:p-7">
            <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-5">
              <div>
                <h2 className="text-xl font-semibold">{text.guidance}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {text.guidanceText}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={reset}
                aria-label={text.reset}
                title={text.reset}
              >
                <RotateCcw aria-hidden="true" />
              </Button>
            </div>

            <Section icon={Gauge} title={text.workload}>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sizing-workload">{text.workload}</Label>
                <select
                  id="sizing-workload"
                  value={form.workload}
                  onChange={(event) =>
                    update("workload", event.target.value as WorkloadKind)
                  }
                  className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {(Object.keys(text.workloadOptions) as WorkloadKind[]).map(
                    (kind) => (
                      <option key={kind} value={kind}>
                        {text.workloadOptions[kind]}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </Section>

            <Section icon={Network} title={text.traffic}>
              <NumberField
                id="sizing-peak-rps"
                label={text.peakRps}
                value={form.peakRps}
                onChange={(value) => update("peakRps", value)}
              />
              <NumberField
                id="sizing-response-time"
                label={text.responseTime}
                value={form.averageResponseTimeMs}
                onChange={(value) => update("averageResponseTimeMs", value)}
              />
              <NumberField
                id="sizing-response-bytes"
                label={text.responseBytes}
                value={form.averageResponseBytes}
                onChange={(value) => update("averageResponseBytes", value)}
              />
              <NumberField
                id="sizing-dynamic-ratio"
                label={text.dynamicRatio}
                value={form.dynamicRatio}
                step={0.05}
                onChange={(value) => update("dynamicRatio", value)}
              />
              <NumberField
                id="sizing-cache-hit"
                label={text.cacheHit}
                value={form.edgeCacheHitRatio}
                step={0.05}
                onChange={(value) => update("edgeCacheHitRatio", value)}
              />
            </Section>

            <Section icon={Database} title={text.data}>
              <NumberField
                id="sizing-live-data"
                label={text.liveData}
                value={form.liveDataGiB}
                onChange={(value) => update("liveDataGiB", value)}
              />
              <NumberField
                id="sizing-monthly-growth"
                label={text.monthlyGrowth}
                value={form.monthlyGrowthGiB}
                onChange={(value) => update("monthlyGrowthGiB", value)}
              />
              <NumberField
                id="sizing-horizon"
                label={text.horizon}
                value={form.horizonMonths}
                step={1}
                onChange={(value) => update("horizonMonths", value)}
              />
            </Section>

            <Section icon={ShieldCheck} title={text.reliability}>
              <NumberField
                id="sizing-rpo"
                label={text.rpo}
                value={form.rpoMinutes}
                onChange={(value) => update("rpoMinutes", value)}
              />
              <NumberField
                id="sizing-rto"
                label={text.rto}
                value={form.rtoMinutes}
                onChange={(value) => update("rtoMinutes", value)}
              />
            </Section>

            <Section icon={ClipboardCheck} title={text.evidence}>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sizing-evidence">{text.evidence}</Label>
                <select
                  id="sizing-evidence"
                  value={form.evidence}
                  onChange={(event) =>
                    update(
                      "evidence",
                      event.target.value as FormState["evidence"],
                    )
                  }
                  className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {(
                    Object.keys(text.evidenceOptions) as FormState["evidence"][]
                  ).map((evidence) => (
                    <option key={evidence} value={evidence}>
                      {text.evidenceOptions[evidence]}
                    </option>
                  ))}
                </select>
              </div>
            </Section>

            <Section icon={HardDrive} title={text.advanced}>
              <NumberField
                id="sizing-cpu-ms"
                label={text.cpuMs}
                value={form.cpuMsPerRequest}
                onChange={(value) => update("cpuMsPerRequest", value)}
              />
              <NumberField
                id="sizing-app-rss"
                label={text.appRss}
                value={form.peakAppRssGiB}
                onChange={(value) => update("peakAppRssGiB", value)}
              />
            </Section>

            {form.workload === "batch_worker" ? (
              <Section icon={HardDrive} title={text.batch}>
                <NumberField
                  id="sizing-batch-jobs"
                  label={text.batchJobs}
                  value={form.jobsPerWindow}
                  onChange={(value) => update("jobsPerWindow", value)}
                />
                <NumberField
                  id="sizing-batch-window"
                  label={text.batchWindow}
                  value={form.completionWindowMinutes}
                  onChange={(value) => update("completionWindowMinutes", value)}
                />
                <NumberField
                  id="sizing-job-duration"
                  label={text.jobDuration}
                  value={form.averageJobDurationSeconds}
                  onChange={(value) =>
                    update("averageJobDurationSeconds", value)
                  }
                />
                <NumberField
                  id="sizing-cpu-seconds"
                  label={text.cpuSeconds}
                  value={form.cpuSecondsPerJob}
                  onChange={(value) => update("cpuSecondsPerJob", value)}
                />
                <NumberField
                  id="sizing-job-memory"
                  label={text.jobMemory}
                  value={form.memoryGiBPerConcurrentJob}
                  onChange={(value) =>
                    update("memoryGiBPerConcurrentJob", value)
                  }
                />
                <NumberField
                  id="sizing-temp-storage"
                  label={text.tempStorage}
                  value={form.temporaryStorageGiBPerConcurrentJob}
                  onChange={(value) =>
                    update("temporaryStorageGiBPerConcurrentJob", value)
                  }
                />
                <NumberField
                  id="sizing-storage-read"
                  label={text.storageRead}
                  value={form.storageReadGiBPerJob}
                  onChange={(value) => update("storageReadGiBPerJob", value)}
                />
                <NumberField
                  id="sizing-storage-write"
                  label={text.storageWrite}
                  value={form.storageWriteGiBPerJob}
                  onChange={(value) => update("storageWriteGiBPerJob", value)}
                />
                <NumberField
                  id="sizing-network-ingress"
                  label={text.networkIngress}
                  value={form.networkIngressGiBPerJob}
                  onChange={(value) => update("networkIngressGiBPerJob", value)}
                />
                <NumberField
                  id="sizing-network-egress"
                  label={text.networkEgress}
                  value={form.networkEgressGiBPerJob}
                  onChange={(value) => update("networkEgressGiBPerJob", value)}
                />
                <NumberField
                  id="sizing-retry-rate"
                  label={text.retryRate}
                  value={form.retryRate}
                  step={0.05}
                  onChange={(value) => update("retryRate", value)}
                />
                <NumberField
                  id="sizing-max-parallelism"
                  label={text.maxParallelism}
                  value={form.maxParallelism}
                  onChange={(value) => update("maxParallelism", value)}
                />
              </Section>
            ) : null}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <div className="rounded-lg border border-border/70 bg-background p-5 shadow-sm md:p-6">
              <div className="flex items-start gap-3">
                <StatusIcon status={result.status} />
                <div>
                  <h2 className="font-semibold">
                    {text.status[result.status]}
                  </h2>
                  {result.status === "invalid_input" ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {text.noEvidence}
                    </p>
                  ) : null}
                </div>
              </div>

              <div
                className="mt-5 grid grid-cols-3 gap-1 rounded-md bg-muted/60 p-1"
                role="tablist"
                aria-label={text.plans.recommended}
              >
                {(["start", "recommended", "ha"] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={planKey === key}
                    disabled={!result[key]}
                    onClick={() => setPlanKey(key)}
                    className={`min-h-11 rounded-sm px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${planKey === key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {text.plans[key]}
                  </button>
                ))}
              </div>

              {activePlan ? (
                <div className="mt-5 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <Metric
                      icon={Gauge}
                      label={text.resource.vcpu}
                      value={planMetric(activePlan, "vcpu", language)}
                    />
                    <Metric
                      icon={Database}
                      label={text.resource.memory}
                      value={planMetric(activePlan, "memoryGiB", language)}
                    />
                    <Metric
                      icon={HardDrive}
                      label={text.resource.storage}
                      value={planMetric(
                        activePlan,
                        "primaryStorageGiB",
                        language,
                      )}
                    />
                    <Metric
                      icon={ShieldCheck}
                      label={text.resource.backup}
                      value={planMetric(
                        activePlan,
                        "backupStorageGiB",
                        language,
                      )}
                    />
                    <Metric
                      icon={Network}
                      label={text.resource.network}
                      value={text.exact(activePlan.networkMbps.egress, "Mbps")}
                    />
                    <Metric
                      icon={Calculator}
                      label={text.resource.replicas}
                      value={String(activePlan.replicas)}
                    />
                  </div>
                  <div className="rounded-md bg-muted/35 px-3 py-3 text-sm leading-6 text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {text.resource.connections}:
                    </span>{" "}
                    {activePlan.databaseConnections ??
                      (language === "zh"
                        ? "按压测校准"
                        : "Calibrate with load tests")}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{activePlan.confidence}</Badge>
                    {activePlan.topology.map((item) => (
                      <Badge key={item} variant="outline">
                        {item}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-muted-foreground">
                  {text.noPlan}
                </p>
              )}

              <div className="mt-6 space-y-5 border-t border-border/70 pt-5">
                <ReasonList
                  title={text.bottlenecks}
                  items={result.bottlenecks}
                  language={language}
                />
                <ReasonList
                  title={text.triggers}
                  items={result.scalingTriggers}
                  language={language}
                />
                <ReasonList
                  title={text.missing}
                  items={result.missingEvidence}
                  language={language}
                />
                <ReasonList
                  title={text.assumptions}
                  items={result.assumptions}
                  language={language}
                />
                <ReasonList
                  title={text.checklist}
                  items={result.verificationChecklist}
                  language={language}
                />
                <ReasonList
                  title={text.recovery}
                  items={result.recoveryChecklist}
                  language={language}
                />
              </div>
            </div>

            <details className="rounded-lg border border-border/70 bg-background p-5 shadow-sm">
              <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {text.trace}
              </summary>
              <div className="mt-4 space-y-2">
                {result.trace.map((item) => (
                  <div
                    key={item.formulaId}
                    className="rounded-md bg-muted/35 px-3 py-2 font-mono text-xs text-muted-foreground"
                  >
                    {item.formulaId}
                  </div>
                ))}
              </div>
            </details>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-3 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Info className="size-4 shrink-0" aria-hidden="true" />
                {text.knowledge}
              </span>
              <Link
                href={language === "en" ? "/en/knowledge" : "/knowledge"}
                className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {language === "zh" ? "打开" : "Open"}
              </Link>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calculator;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-md border border-border/70 bg-background px-3 py-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5 text-primary" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <p className="mt-2 break-words font-mono text-sm font-semibold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
