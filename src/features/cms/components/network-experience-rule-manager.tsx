"use client";

import { useMemo, useState } from "react";
import { CopyPlus, Send, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cloneNetworkExperienceRules,
  createNetworkExperienceRules,
  publishNetworkExperienceRules,
  reviewNetworkExperienceRules,
} from "@/features/cms/actions/network-experience";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";
import {
  INITIAL_NETWORK_EXPERIENCE_RULE_SNAPSHOT,
  stableNetworkExperienceChecksum,
  type NetworkExperienceRuleSetSnapshot,
} from "@fwqgo/core/network-experience";

type RuleRow = {
  id: number;
  versionLabel: string;
  engineVersion: string;
  schemaVersion: number;
  status: string;
  checksum: string;
  revision: number;
  reviewedBy: string | null;
  publishedBy: string | null;
  createdAt: Date;
  publishedAt: Date | null;
};

function defaultDraftJson() {
  return JSON.stringify(INITIAL_NETWORK_EXPERIENCE_RULE_SNAPSHOT, null, 2);
}

export function NetworkExperienceRuleManager({ rules }: { rules: RuleRow[] }) {
  const { mutate, isPending } = useAdminMutation();
  const [versionLabel, setVersionLabel] = useState("");
  const [configText, setConfigText] = useState(defaultDraftJson);
  const parsed = useMemo(() => parseSnapshot(configText), [configText]);

  function createDraft() {
    if (!parsed) return;
    const { checksum, ...baseConfig } = parsed;
    void checksum;
    const config = {
      ...baseConfig,
      versionLabel: versionLabel.trim() || baseConfig.versionLabel,
      reviewDueAt: baseConfig.reviewDueAt ?? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    };
    void mutate({
      key: "network-experience-rule:create",
      pendingMessage: "正在创建线路经验规则草稿...",
      action: () => createNetworkExperienceRules({
        versionLabel: versionLabel.trim() || config.versionLabel,
        config,
        checksum: stableNetworkExperienceChecksum(config),
        changeSummary: "通过 CMS 创建的线路经验规则草稿",
        enChangeSummary: "Route experience rule draft created in CMS",
      }),
      errorTitle: "规则草稿创建失败",
      onSuccess: () => setVersionLabel(""),
    });
  }

  function review(rule: RuleRow) {
    void mutate({ key: `network-experience-rule:review:${rule.id}`, pendingMessage: "正在记录独立审核...", action: () => reviewNetworkExperienceRules({ id: rule.id, expectedRevision: rule.revision }), errorTitle: "规则审核失败" });
  }

  function publish(rule: RuleRow) {
    void mutate({ key: `network-experience-rule:publish:${rule.id}`, pendingMessage: "正在发布线路经验规则...", action: () => publishNetworkExperienceRules({ id: rule.id, expectedRevision: rule.revision }), errorTitle: "规则发布失败", errorSuggestion: "必须由不同管理员完成审核和发布。" });
  }

  function clone(rule: RuleRow) {
    void mutate({ key: `network-experience-rule:clone:${rule.id}`, pendingMessage: "正在克隆规则集...", action: () => cloneNetworkExperienceRules({ id: rule.id, versionLabel: `${rule.versionLabel}-next` }), errorTitle: "规则克隆失败" });
  }

  return <div className="space-y-5">
    <div className="rounded-md border border-border/70 p-4">
      <div className="flex items-center gap-2"><Send className="size-4 text-primary" /><h2 className="text-sm font-semibold">创建经验规则草稿</h2></div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">规则只保存受控枚举和 reason code；必须包含风险码与验证码，不接受延迟、丢包、质量分或商家排名。</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-1.5"><Label className="text-xs">版本标签</Label><Input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="2026.08-experience-v1" /></div>
        <div className="space-y-1.5"><Label className="text-xs">规则 JSON</Label><Textarea value={configText} onChange={(event) => setConfigText(event.target.value)} rows={8} className="font-mono text-xs" /></div>
        <Button type="button" onClick={createDraft} disabled={!parsed || isPending("network-experience-rule:create")}>创建 draft</Button>
      </div>
      {!parsed ? <p className="mt-2 text-xs text-destructive">规则 JSON 无效，需包含版本、引擎、schema 和 rules。</p> : null}
    </div>
    <div className="overflow-x-auto rounded-md border border-border/70"><table className="cms-mobile-sticky-actions w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2">版本</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">checksum</th><th className="px-3 py-2">审核 / 发布</th><th className="px-3 py-2">操作</th></tr></thead><tbody className="divide-y divide-border/70">{rules.map((rule) => <tr key={rule.id}><td className="px-3 py-3 font-medium">{rule.versionLabel}<div className="text-xs text-muted-foreground">r{rule.revision}</div></td><td className="px-3 py-3">{rule.status}</td><td className="max-w-[260px] break-all px-3 py-3 font-mono text-xs text-muted-foreground">{rule.checksum}</td><td className="px-3 py-3 text-xs text-muted-foreground">{rule.reviewedBy ?? "未审核"} / {rule.publishedBy ?? "未发布"}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-2">{rule.status === "draft" ? <><Button type="button" size="sm" variant="outline" onClick={() => review(rule)} disabled={isPending(`network-experience-rule:review:${rule.id}`)}><ShieldCheck className="size-4" />审核</Button><Button type="button" size="sm" onClick={() => publish(rule)} disabled={!rule.reviewedBy || isPending(`network-experience-rule:publish:${rule.id}`)}>发布</Button></> : <Button type="button" size="sm" variant="outline" onClick={() => clone(rule)} disabled={isPending(`network-experience-rule:clone:${rule.id}`)}><CopyPlus className="size-4" />克隆新草稿</Button>}</div></td></tr>)}</tbody></table>{rules.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">暂无经验规则集。</p> : null}</div>
  </div>;
}

function parseSnapshot(value: string): NetworkExperienceRuleSetSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.versionLabel !== "string" || record.engineVersion !== "network-experience-engine-v1" || record.schemaVersion !== 1 || !Array.isArray(record.rules)) return null;
    return { ...record, checksum: typeof record.checksum === "string" ? record.checksum : "" } as unknown as NetworkExperienceRuleSetSnapshot;
  } catch {
    return null;
  }
}
