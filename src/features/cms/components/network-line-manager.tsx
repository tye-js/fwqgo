"use client";

import { useState, type FormEvent } from "react";
import { Activity, Plus, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createNetworkCandidateAction,
  createNetworkCampaignAction,
  setNetworkCandidateStatusAction,
} from "@/features/cms/actions/network-assessment";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";

type CandidateRow = {
  id: number;
  slug: string;
  name: string;
  enName: string | null;
  status: string;
  currentRevisionId: number | null;
  updatedAt: Date | null;
};

const emptyCandidate = {
  slug: "",
  name: "",
  enName: "",
  regionCode: "hong_kong",
  datacenter: "",
  productRef: "",
  declaredLabels: "",
  configurationJson: "{}",
};

const emptyCampaign = {
  candidateId: "",
  protocolVersion: "network-measurement-protocol-v1",
  intervalMinutes: "30",
  probeSelector: '{\n  "carrier": "telecom",\n  "regions": ["east_china"]\n}',
  metricProfile: '{\n  "protocols": ["icmp", "tcp", "tls", "http"],\n  "directions": ["forward", "reverse"]\n}',
  peakWindows: "[]",
  configurationJson: "{}",
};

export function NetworkLineManager({ candidates }: { candidates: CandidateRow[] }) {
  const { mutate, isPending } = useAdminMutation();
  const [candidate, setCandidate] = useState(emptyCandidate);
  const [campaign, setCampaign] = useState(emptyCampaign);

  function saveCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({
      key: "network-candidate:create",
      pendingMessage: "正在创建线路候选...",
      action: () =>
        createNetworkCandidateAction({
          ...candidate,
          enName: candidate.enName || null,
          declaredLabels: candidate.declaredLabels
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          configurationJson: parseJson(candidate.configurationJson, "配置 JSON"),
        }),
      errorTitle: "线路候选创建失败",
      onSuccess: () => setCandidate(emptyCandidate),
    });
  }

  function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidateId = Number(campaign.candidateId);
    void mutate({
      key: "network-campaign:create",
      pendingMessage: "正在创建测量活动...",
      action: () =>
        createNetworkCampaignAction({
          candidateId,
          protocolVersion: campaign.protocolVersion,
          intervalMinutes: Number(campaign.intervalMinutes),
          probeSelector: parseJson(campaign.probeSelector, "探针选择器"),
          metricProfile: parseJson(campaign.metricProfile, "指标配置"),
          peakWindows: parseJsonArray(campaign.peakWindows, "高峰窗口"),
          configurationJson: parseJson(campaign.configurationJson, "活动配置"),
        }),
      errorTitle: "测量活动创建失败",
      onSuccess: () => setCampaign((current) => ({ ...current, candidateId: "" })),
    });
  }

  function activateCandidate(candidateId: number) {
    void mutate({
      key: `network-candidate:activate:${candidateId}`,
      pendingMessage: "正在激活线路候选...",
      action: () => setNetworkCandidateStatusAction({ candidateId, status: "active" }),
      errorTitle: "线路候选激活失败",
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={saveCandidate} className="space-y-4 rounded-md border border-border/70 p-4">
          <div className="flex items-center gap-2"><Plus className="size-4 text-primary" /><h2 className="text-sm font-semibold">登记线路候选</h2></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Slug"><Input value={candidate.slug} onChange={(event) => setCandidate({ ...candidate, slug: event.target.value })} required /></Field>
            <Field label="中文名称"><Input value={candidate.name} onChange={(event) => setCandidate({ ...candidate, name: event.target.value })} required /></Field>
            <Field label="英文名称"><Input value={candidate.enName} onChange={(event) => setCandidate({ ...candidate, enName: event.target.value })} /></Field>
            <Field label="区域代码"><Input value={candidate.regionCode} onChange={(event) => setCandidate({ ...candidate, regionCode: event.target.value })} required /></Field>
            <Field label="机房"><Input value={candidate.datacenter} onChange={(event) => setCandidate({ ...candidate, datacenter: event.target.value })} required /></Field>
            <Field label="实际产品标识"><Input value={candidate.productRef} onChange={(event) => setCandidate({ ...candidate, productRef: event.target.value })} required /></Field>
          </div>
          <Field label="声明标签（逗号分隔）"><Input value={candidate.declaredLabels} onChange={(event) => setCandidate({ ...candidate, declaredLabels: event.target.value })} /></Field>
          <Field label="配置 JSON"><Textarea value={candidate.configurationJson} onChange={(event) => setCandidate({ ...candidate, configurationJson: event.target.value })} rows={4} /></Field>
          <Button type="submit" disabled={isPending("network-candidate:create")}><Save className="size-4" />创建候选草稿</Button>
        </form>

        <form onSubmit={saveCampaign} className="space-y-4 rounded-md border border-border/70 p-4">
          <div className="flex items-center gap-2"><Activity className="size-4 text-primary" /><h2 className="text-sm font-semibold">创建测量活动</h2></div>
          <Field label="候选线路">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={campaign.candidateId} onChange={(event) => setCampaign({ ...campaign, candidateId: event.target.value })} required>
              <option value="">请选择候选</option>
              {candidates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.slug}</option>)}
            </select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="协议版本"><Input value={campaign.protocolVersion} onChange={(event) => setCampaign({ ...campaign, protocolVersion: event.target.value })} required /></Field>
            <Field label="间隔（分钟）"><Input type="number" min={1} max={10080} value={campaign.intervalMinutes} onChange={(event) => setCampaign({ ...campaign, intervalMinutes: event.target.value })} required /></Field>
          </div>
          <Field label="探针选择器 JSON"><Textarea value={campaign.probeSelector} onChange={(event) => setCampaign({ ...campaign, probeSelector: event.target.value })} rows={3} /></Field>
          <Field label="指标配置 JSON"><Textarea value={campaign.metricProfile} onChange={(event) => setCampaign({ ...campaign, metricProfile: event.target.value })} rows={3} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="高峰窗口 JSON 数组"><Textarea value={campaign.peakWindows} onChange={(event) => setCampaign({ ...campaign, peakWindows: event.target.value })} rows={2} /></Field>
            <Field label="活动配置 JSON"><Textarea value={campaign.configurationJson} onChange={(event) => setCampaign({ ...campaign, configurationJson: event.target.value })} rows={2} /></Field>
          </div>
          <Button type="submit" disabled={isPending("network-campaign:create") || candidates.length === 0}><Save className="size-4" />创建活动草稿</Button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-md border border-border/70">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2">候选</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">revision</th><th className="px-3 py-2">操作</th></tr></thead>
          <tbody className="divide-y divide-border/70">
            {candidates.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-3"><div className="font-medium">{item.name}</div><div className="text-xs text-muted-foreground">{item.slug}{item.enName ? ` · ${item.enName}` : ""}</div></td>
                <td className="px-3 py-3">{item.status}</td>
                <td className="px-3 py-3 tabular-nums">{item.currentRevisionId ?? "—"}</td>
                <td className="px-3 py-3">{item.status === "draft" ? <Button type="button" size="sm" variant="outline" onClick={() => activateCandidate(item.id)} disabled={isPending(`network-candidate:activate:${item.id}`)}>激活</Button> : <span className="text-xs text-muted-foreground">需通过测量与 assessment 发布</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {candidates.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">暂无线路候选。</p> : null}
      </div>
    </div>
  );
}

function parseJson(value: string, label: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error(`${label}必须是 JSON 对象`);
  }
}

function parseJsonArray(value: string, label: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== "object" || Array.isArray(item))) throw new Error();
    return parsed as Array<Record<string, unknown>>;
  } catch {
    throw new Error(`${label}必须是 JSON 对象数组`);
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
