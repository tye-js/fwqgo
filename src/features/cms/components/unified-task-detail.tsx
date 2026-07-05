import { AlertCircle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type UnifiedTaskStep = {
  key: string;
  name: string;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  description: string;
  time: string | null;
  payload?: string | null;
};

const stepStatusLabels: Record<UnifiedTaskStep["status"], string> = {
  pending: "等待中",
  running: "处理中",
  success: "成功",
  failed: "失败",
  cancelled: "已取消",
};

const stepStatusVariants: Record<
  UnifiedTaskStep["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  running: "secondary",
  success: "default",
  failed: "destructive",
  cancelled: "outline",
};

function formatTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StepIcon({ status }: { status: UnifiedTaskStep["status"] }) {
  if (status === "success") {
    return <CheckCircle2 className="size-4 text-primary" />;
  }

  if (status === "failed" || status === "cancelled") {
    return <XCircle className="size-4 text-destructive" />;
  }

  if (status === "running") {
    return <AlertCircle className="size-4 text-amber-600" />;
  }

  return <CircleDashed className="size-4 text-muted-foreground" />;
}

function payloadPreview(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export function UnifiedTaskStat({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-all text-base font-semibold text-foreground">
        {value ?? "-"}
      </p>
    </div>
  );
}

export function UnifiedTaskStepTimeline({
  steps,
}: {
  steps: UnifiedTaskStep[];
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {steps.map((step) => (
        <div
          key={step.key}
          className="flex gap-3 rounded-md border border-border/70 bg-background p-3"
        >
          <div className="mt-0.5">
            <StepIcon status={step.status} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">{step.name}</p>
              <Badge variant={stepStatusVariants[step.status]}>
                {stepStatusLabels[step.status]}
              </Badge>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              {step.description}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatTime(step.time)}
            </p>
            {step.payload ? (
              <details className="pt-1">
                <summary className="cursor-pointer text-xs font-medium text-primary">
                  查看日志 / payload
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
                  {payloadPreview(step.payload)}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function formatUnifiedTaskTime(value: string | null) {
  return formatTime(value);
}
