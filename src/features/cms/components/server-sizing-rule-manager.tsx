"use client";

import { useMemo, useState } from "react";
import { CopyPlus, Send, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  cloneServerSizingRules,
  createServerSizingRules,
  publishServerSizingRules,
  reviewServerSizingRules,
} from "@/features/cms/actions/server-sizing";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";
import {
  PUBLISHED_SERVER_SIZING_RULE_SET,
  stableRuleChecksum,
  type ServerSizingRuleSet,
} from "@fwqgo/core/server-sizing";

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
  const { checksum, ...rules } = PUBLISHED_SERVER_SIZING_RULE_SET;
  void checksum;
  return JSON.stringify({ ...rules, status: "draft" }, null, 2);
}

export function ServerSizingRuleManager({ rules }: { rules: RuleRow[] }) {
  const { mutate, isPending } = useAdminMutation();
  const [versionLabel, setVersionLabel] = useState("");
  const [configText, setConfigText] = useState(defaultDraftJson);
  const parsed = useMemo(() => parseRules(configText), [configText]);

  function createDraft() {
    if (!parsed) return;
    const config = { ...parsed, versionLabel: versionLabel.trim() || parsed.versionLabel, status: "draft" } as Omit<ServerSizingRuleSet, "checksum">;
    void mutate({
      key: "server-sizing-rule:create",
      pendingMessage: "正在创建规则草稿...",
      action: () =>
        createServerSizingRules({
          versionLabel: config.versionLabel,
          config,
          checksum: stableRuleChecksum(config),
          changeSummary: "通过 CMS 创建的规则草稿",
          enChangeSummary: "Rule draft created in CMS",
        }),
      errorTitle: "规则草稿创建失败",
      onSuccess: () => setVersionLabel(""),
    });
  }

  function clone(id: number) {
    void mutate({
      key: `server-sizing-rule:clone:${id}`,
      pendingMessage: "正在克隆规则集...",
      action: () => cloneServerSizingRules({ id, versionLabel: `${versionLabel.trim() || "next"}-${Date.now()}` }),
      errorTitle: "规则集克隆失败",
    });
  }

  function review(rule: RuleRow) {
    void mutate({
      key: `server-sizing-rule:review:${rule.id}`,
      pendingMessage: "正在记录独立审核...",
      action: () => reviewServerSizingRules({ id: rule.id, expectedRevision: rule.revision }),
      errorTitle: "规则集审核失败",
    });
  }

  function publish(rule: RuleRow) {
    void mutate({
      key: `server-sizing-rule:publish:${rule.id}`,
      pendingMessage: "正在发布规则集...",
      action: () => publishServerSizingRules({ id: rule.id, expectedRevision: rule.revision }),
      errorTitle: "规则集发布失败",
      errorSuggestion: "必须由不同管理员完成审核和发布。",
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border/70 p-4">
        <div className="flex items-center gap-2"><CopyPlus className="size-4 text-primary" /><h2 className="text-sm font-semibold">创建规则草稿</h2></div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">公式由代码固定；CMS 只允许保存经过 checksum 校验的 JSON 规则参数。</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-1.5"><Label className="text-xs">版本标签</Label><Input value={versionLabel} onChange={(event) => setVersionLabel(event.target.value)} placeholder="2026.08.2" /></div>
          <div className="space-y-1.5"><Label className="text-xs">规则 JSON</Label><Textarea value={configText} onChange={(event) => setConfigText(event.target.value)} rows={8} className="font-mono text-xs" /></div>
          <Button type="button" onClick={createDraft} disabled={!parsed || isPending("server-sizing-rule:create")}><Send className="size-4" />创建 draft</Button>
        </div>
        {!parsed ? <p className="mt-2 text-xs text-destructive">规则 JSON 无效，无法创建草稿。</p> : null}
      </div>

      <div className="overflow-x-auto rounded-md border border-border/70">
        <table className="cms-mobile-sticky-actions w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2">版本</th><th className="px-3 py-2">状态</th><th className="px-3 py-2">checksum</th><th className="px-3 py-2">审核 / 发布</th><th className="px-3 py-2">操作</th></tr></thead>
          <tbody className="divide-y divide-border/70">
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td className="px-3 py-3 font-medium">{rule.versionLabel}<div className="text-xs text-muted-foreground">r{rule.revision}</div></td>
                <td className="px-3 py-3">{rule.status}</td>
                <td className="max-w-[260px] break-all px-3 py-3 font-mono text-xs text-muted-foreground">{rule.checksum}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{rule.reviewedBy ?? "未审核"} / {rule.publishedBy ?? "未发布"}</td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-2">{rule.status === "draft" ? <><Button type="button" size="sm" variant="outline" onClick={() => review(rule)} disabled={isPending(`server-sizing-rule:review:${rule.id}`)}><ShieldCheck className="size-4" />审核</Button><Button type="button" size="sm" onClick={() => publish(rule)} disabled={!rule.reviewedBy || isPending(`server-sizing-rule:publish:${rule.id}`)}><Send className="size-4" />发布</Button></> : <Button type="button" size="sm" variant="outline" onClick={() => clone(rule.id)} disabled={isPending(`server-sizing-rule:clone:${rule.id}`)}><CopyPlus className="size-4" />克隆新草稿</Button>}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rules.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">暂无规则集。</p> : null}
      </div>
    </div>
  );
}

function parseRules(value: string): Omit<ServerSizingRuleSet, "checksum"> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.engineVersion !== "string" || record.schemaVersion !== 1 || !record.profiles) return null;
    return record as unknown as Omit<ServerSizingRuleSet, "checksum">;
  } catch {
    return null;
  }
}
