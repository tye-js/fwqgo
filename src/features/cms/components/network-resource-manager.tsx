"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, Router, Save, Server, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createNetworkProbeAction,
  createNetworkTargetAction,
  createNetworkTargetAgentAction,
  issueNetworkCredentialAction,
  recordNetworkPrefixVerificationAction,
  revokeNetworkCredentialAction,
} from "@/features/cms/actions/network-assessment";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";

type CandidateOption = { id: number; name: string; slug: string };

type ResourceData = {
  probes: Array<{
    id: number;
    sourceKind: string;
    externalId: string;
    status: string;
    revisionId: number | null;
    regionCode: string | null;
    carrier: string | null;
    accessType: string | null;
    lastSeenAt: Date | null;
  }>;
  targetAgents: Array<{
    id: number;
    candidateId: number;
    externalId: string;
    status: string;
    revisionId: number | null;
    lastSeenAt: Date | null;
  }>;
  targets: Array<{
    id: number;
    candidateId: number;
    enabled: boolean;
    revisionId: number | null;
    addressFamily: string | null;
    targetAddress: string | null;
    targetPrefix: string | null;
    port: number | null;
    targetAgentRevisionId: number | null;
  }>;
  credentials: Array<{
    id: number;
    probeId: number | null;
    targetAgentId: number | null;
    keyId: string;
    activatedAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
  }>;
};

const emptyProbe = {
  sourceKind: "self_hosted",
  externalId: "",
  countryCode: "CN",
  regionCode: "east_china",
  carrier: "telecom",
  accessType: "residential",
  asn: "",
  capabilities: "icmp,tcp,tls,http,traceroute",
  trustLevel: "E2",
  ownerOrgKey: "",
  accessPrefixKey: "",
  physicalSiteKey: "",
  independenceKey: "",
};

const emptyAgent = { candidateId: "", externalId: "", capabilities: "tcp,tls,http" };
const emptyTarget = {
  candidateId: "",
  targetAgentRevisionId: "",
  addressFamily: "ipv4",
  targetAddress: "",
  targetPrefix: "",
  originAsn: "",
  port: "443",
};
const emptyCredential = {
  ownerKind: "probe",
  ownerId: "",
  keyId: "",
  secret: "",
  expiresAt: "",
};
const emptyVerification = {
  targetRevisionId: "",
  deliveryPrefixHash: "",
  verificationMethod: "rdap+route",
  evidenceRef: "",
  validUntil: "",
};

export function NetworkResourceManager({
  candidates,
  resources,
}: {
  candidates: CandidateOption[];
  resources: ResourceData;
}) {
  const { mutate, isPending } = useAdminMutation();
  const [probe, setProbe] = useState(emptyProbe);
  const [agent, setAgent] = useState(emptyAgent);
  const [target, setTarget] = useState(emptyTarget);
  const [credential, setCredential] = useState(emptyCredential);
  const [verification, setVerification] = useState(emptyVerification);

  function submitProbe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({
      key: "network-resource:probe:create",
      pendingMessage: "正在登记探针...",
      action: () =>
        createNetworkProbeAction({
          ...probe,
          carrier: probe.carrier as "telecom" | "unicom" | "mobile" | "other",
          accessType: probe.accessType as "residential" | "business" | "mobile" | "unknown",
          countryCode: probe.countryCode || null,
          asn: parseNullableNumber(probe.asn),
          capabilities: splitList(probe.capabilities),
        }),
      errorTitle: "探针登记失败",
      onSuccess: () => setProbe(emptyProbe),
    });
  }

  function submitAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({
      key: "network-resource:agent:create",
      pendingMessage: "正在登记目标 agent...",
      action: () =>
        createNetworkTargetAgentAction({
          candidateId: Number(agent.candidateId),
          externalId: agent.externalId,
          capabilities: splitList(agent.capabilities),
        }),
      errorTitle: "目标 agent 登记失败",
      onSuccess: () => setAgent(emptyAgent),
    });
  }

  function submitTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({
      key: "network-resource:target:create",
      pendingMessage: "正在登记测量目标...",
      action: () =>
        createNetworkTargetAction({
          candidateId: Number(target.candidateId),
          targetAgentRevisionId: target.targetAgentRevisionId
            ? Number(target.targetAgentRevisionId)
            : null,
          addressFamily: target.addressFamily as "ipv4" | "ipv6",
          targetAddress: target.targetAddress,
          targetPrefix: target.targetPrefix,
          originAsn: parseNullableNumber(target.originAsn),
          port: parseNullableNumber(target.port),
        }),
      errorTitle: "测量目标登记失败",
      onSuccess: () => setTarget(emptyTarget),
    });
  }

  function submitCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({
      key: "network-resource:credential:issue",
      pendingMessage: "正在加密保存 credential...",
      action: () =>
        issueNetworkCredentialAction({
          ...(credential.ownerKind === "probe"
            ? { probeId: Number(credential.ownerId) }
            : { targetAgentId: Number(credential.ownerId) }),
          keyId: credential.keyId || undefined,
          secret: credential.secret,
          expiresAt: credential.expiresAt
            ? new Date(`${credential.expiresAt}T00:00:00.000Z`)
            : null,
        }),
      errorTitle: "credential 签发失败",
      errorSuggestion: "明文 secret 只在本次提交中使用；请确认已安全交给 agent 安装人员。",
      onSuccess: () => setCredential(emptyCredential),
    });
  }

  function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({
      key: "network-resource:prefix-verification:create",
      pendingMessage: "正在保存前缀核验...",
      action: () =>
        recordNetworkPrefixVerificationAction({
          targetRevisionId: Number(verification.targetRevisionId),
          deliveryPrefixHash: verification.deliveryPrefixHash,
          verificationMethod: verification.verificationMethod,
          evidenceRef: verification.evidenceRef || null,
          validUntil: verification.validUntil
            ? new Date(`${verification.validUntil}T00:00:00.000Z`)
            : null,
        }),
      errorTitle: "前缀核验记录失败",
      onSuccess: () => setVerification(emptyVerification),
    });
  }

  function revokeCredential(id: number) {
    if (!window.confirm("撤销后该 key 立即失效，确定继续吗？")) return;
    void mutate({
      key: `network-resource:credential:revoke:${id}`,
      pendingMessage: "正在撤销 credential...",
      action: () => revokeNetworkCredentialAction({ id }),
      errorTitle: "credential 撤销失败",
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-2">
        <ResourceForm icon={<Router className="size-4 text-primary" />} title="登记探针" onSubmit={submitProbe}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="来源类型"><Input value={probe.sourceKind} onChange={(event) => setProbe({ ...probe, sourceKind: event.target.value })} required /></Field>
            <Field label="externalId"><Input value={probe.externalId} onChange={(event) => setProbe({ ...probe, externalId: event.target.value })} required /></Field>
            <Field label="国家/地区"><Input value={probe.countryCode} onChange={(event) => setProbe({ ...probe, countryCode: event.target.value })} /></Field>
            <Field label="区域代码"><Input value={probe.regionCode} onChange={(event) => setProbe({ ...probe, regionCode: event.target.value })} required /></Field>
            <Field label="运营商"><Select value={probe.carrier} onChange={(value) => setProbe({ ...probe, carrier: value })} options={[["telecom", "电信"], ["unicom", "联通"], ["mobile", "移动"], ["other", "其他"]]} /></Field>
            <Field label="接入类型"><Select value={probe.accessType} onChange={(value) => setProbe({ ...probe, accessType: value })} options={[["residential", "家庭宽带"], ["business", "企业宽带"], ["mobile", "移动网络"], ["unknown", "未知"]]} /></Field>
            <Field label="ASN"><Input inputMode="numeric" value={probe.asn} onChange={(event) => setProbe({ ...probe, asn: event.target.value })} /></Field>
            <Field label="信任等级"><Input value={probe.trustLevel} onChange={(event) => setProbe({ ...probe, trustLevel: event.target.value })} required /></Field>
          </div>
          <Field label="能力（逗号分隔）"><Input value={probe.capabilities} onChange={(event) => setProbe({ ...probe, capabilities: event.target.value })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="ownerOrgKey"><Input value={probe.ownerOrgKey} onChange={(event) => setProbe({ ...probe, ownerOrgKey: event.target.value })} required /></Field><Field label="independenceKey"><Input value={probe.independenceKey} onChange={(event) => setProbe({ ...probe, independenceKey: event.target.value })} required /></Field><Field label="accessPrefixKey"><Input value={probe.accessPrefixKey} onChange={(event) => setProbe({ ...probe, accessPrefixKey: event.target.value })} required /></Field><Field label="physicalSiteKey"><Input value={probe.physicalSiteKey} onChange={(event) => setProbe({ ...probe, physicalSiteKey: event.target.value })} required /></Field></div>
          <SubmitButton pending={isPending("network-resource:probe:create")} label="创建探针 revision" />
        </ResourceForm>

        <ResourceForm icon={<Server className="size-4 text-primary" />} title="登记目标 agent" onSubmit={submitAgent}>
          <Field label="候选线路"><CandidateSelect value={agent.candidateId} onChange={(value) => setAgent({ ...agent, candidateId: value })} candidates={candidates} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="externalId"><Input value={agent.externalId} onChange={(event) => setAgent({ ...agent, externalId: event.target.value })} required /></Field><Field label="能力（逗号分隔）"><Input value={agent.capabilities} onChange={(event) => setAgent({ ...agent, capabilities: event.target.value })} /></Field></div>
          <SubmitButton pending={isPending("network-resource:agent:create")} label="创建 target agent revision" />
        </ResourceForm>

        <ResourceForm icon={<ShieldCheck className="size-4 text-primary" />} title="登记受控测量目标" onSubmit={submitTarget}>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="候选线路"><CandidateSelect value={target.candidateId} onChange={(value) => setTarget({ ...target, candidateId: value })} candidates={candidates} /></Field><Field label="target agent revision（可选）"><Input inputMode="numeric" value={target.targetAgentRevisionId} onChange={(event) => setTarget({ ...target, targetAgentRevisionId: event.target.value })} /></Field><Field label="地址族"><Select value={target.addressFamily} onChange={(value) => setTarget({ ...target, addressFamily: value })} options={[["ipv4", "IPv4"], ["ipv6", "IPv6"]]} /></Field><Field label="端口"><Input inputMode="numeric" value={target.port} onChange={(event) => setTarget({ ...target, port: event.target.value })} /></Field></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="目标地址"><Input value={target.targetAddress} onChange={(event) => setTarget({ ...target, targetAddress: event.target.value })} required /></Field><Field label="交付前缀"><Input value={target.targetPrefix} onChange={(event) => setTarget({ ...target, targetPrefix: event.target.value })} required /></Field><Field label="源站 ASN"><Input inputMode="numeric" value={target.originAsn} onChange={(event) => setTarget({ ...target, originAsn: event.target.value })} /></Field></div>
          <SubmitButton pending={isPending("network-resource:target:create")} label="创建 target allowlist revision" />
        </ResourceForm>

        <ResourceForm icon={<KeyRound className="size-4 text-primary" />} title="签发 measurement credential" onSubmit={submitCredential}>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="绑定类型"><Select value={credential.ownerKind} onChange={(value) => setCredential({ ...credential, ownerKind: value, ownerId: "" })} options={[["probe", "Probe"], ["target_agent", "Target agent"]]} /></Field><Field label="资源 ID"><Input inputMode="numeric" value={credential.ownerId} onChange={(event) => setCredential({ ...credential, ownerId: event.target.value })} required /></Field><Field label="keyId（留空自动生成）"><Input value={credential.keyId} onChange={(event) => setCredential({ ...credential, keyId: event.target.value })} /></Field><Field label="到期日期"><Input type="date" value={credential.expiresAt} onChange={(event) => setCredential({ ...credential, expiresAt: event.target.value })} /></Field></div>
          <Field label="HMAC secret（至少 32 字节，只提交一次）"><Input type="password" value={credential.secret} onChange={(event) => setCredential({ ...credential, secret: event.target.value })} minLength={32} required autoComplete="new-password" /></Field>
          <p className="text-xs leading-5 text-muted-foreground">数据库只保存加密 ciphertext，列表不会显示 secret。签发后请按运行手册安全交给对应 agent。</p>
          <SubmitButton pending={isPending("network-resource:credential:issue")} label="加密保存 credential" />
        </ResourceForm>

        <ResourceForm icon={<ShieldCheck className="size-4 text-primary" />} title="记录 target 前缀核验" onSubmit={submitVerification}>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="target revision ID"><Input inputMode="numeric" value={verification.targetRevisionId} onChange={(event) => setVerification({ ...verification, targetRevisionId: event.target.value })} required /></Field><Field label="交付前缀 hash"><Input value={verification.deliveryPrefixHash} onChange={(event) => setVerification({ ...verification, deliveryPrefixHash: event.target.value })} placeholder="sha256:..." required /></Field><Field label="核验方式"><Input value={verification.verificationMethod} onChange={(event) => setVerification({ ...verification, verificationMethod: event.target.value })} required /></Field><Field label="有效期"><Input type="date" value={verification.validUntil} onChange={(event) => setVerification({ ...verification, validUntil: event.target.value })} /></Field></div>
          <Field label="证据引用（URL 或内部记录 ID）"><Input value={verification.evidenceRef} onChange={(event) => setVerification({ ...verification, evidenceRef: event.target.value })} /></Field>
          <SubmitButton pending={isPending("network-resource:prefix-verification:create")} label="保存核验记录" />
        </ResourceForm>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ResourceTable title="探针" rows={resources.probes.map((item) => `${item.externalId} · ${item.regionCode ?? "—"} · ${item.carrier ?? "—"} · ${item.status} · r${item.revisionId ?? "—"}`)} />
        <ResourceTable title="目标 agent" rows={resources.targetAgents.map((item) => `#${item.id} · candidate ${item.candidateId} · ${item.externalId} · ${item.status} · r${item.revisionId ?? "—"}`)} />
        <ResourceTable title="测量目标" rows={resources.targets.map((item) => `#${item.id} · candidate ${item.candidateId} · ${item.addressFamily ?? "—"} ${item.targetAddress ?? "—"}:${item.port ?? "—"} · ${item.enabled ? "enabled" : "disabled"}`)} />
        <div className="overflow-x-auto rounded-md border border-border/70"><div className="border-b border-border/70 px-3 py-2 text-sm font-semibold">Credential</div><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2">keyId</th><th className="px-3 py-2">owner</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">操作</th></tr></thead><tbody className="divide-y divide-border/70">{resources.credentials.map((item) => <tr key={item.id}><td className="px-3 py-2 font-mono">{item.keyId}</td><td className="px-3 py-2">{item.probeId ? `probe #${item.probeId}` : `agent #${item.targetAgentId}`}</td><td className="px-3 py-2">{item.revokedAt ? "revoked" : item.expiresAt && item.expiresAt <= new Date() ? "expired" : "active"}</td><td className="px-3 py-2"><Button type="button" size="sm" variant="outline" disabled={Boolean(item.revokedAt) || isPending(`network-resource:credential:revoke:${item.id}`)} onClick={() => revokeCredential(item.id)}>撤销</Button></td></tr>)}</tbody></table>{resources.credentials.length === 0 ? <p className="p-5 text-center text-muted-foreground">暂无 credential。</p> : null}</div>
      </div>
    </div>
  );
}

function splitList(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function parseNullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.NaN;
}

function ResourceForm({ icon, title, onSubmit, children }: { icon: ReactNode; title: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode }) {
  return <form onSubmit={onSubmit} className="space-y-4 rounded-md border border-border/70 p-4"><div className="flex items-center gap-2">{icon}<h2 className="text-sm font-semibold">{title}</h2></div>{children}</form>;
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return <Button type="submit" disabled={pending}><Save className="size-4" />{label}</Button>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
  return <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
}

function CandidateSelect({ value, onChange, candidates }: { value: string; onChange: (value: string) => void; candidates: CandidateOption[] }) {
  return <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)} required><option value="">请选择候选</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.slug}</option>)}</select>;
}

function ResourceTable({ title, rows }: { title: string; rows: string[] }) {
  return <div className="rounded-md border border-border/70"><div className="border-b border-border/70 px-3 py-2 text-sm font-semibold">{title}</div>{rows.length ? <ul className="divide-y divide-border/70 text-xs">{rows.map((row, index) => <li key={`${row}-${index}`} className="break-words px-3 py-2">{row}</li>)}</ul> : <p className="p-5 text-center text-xs text-muted-foreground">暂无记录。</p>}</div>;
}
