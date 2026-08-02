"use client";

import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";
import {
  publishNetworkAssessmentAction,
  withdrawNetworkAssessmentAction,
} from "@/features/cms/actions/network-assessment";
import { Button } from "@/components/ui/button";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";

type AssessmentRow = {
  id: number;
  candidateId: number;
  audienceProfileKey: string;
  observedFrom: Date;
  observedTo: Date;
  validUntil: Date | null;
  formulaVersion: string;
  policyChecksum: string;
  createdAt: Date;
  headRevision: number | null;
  headSnapshotId: number | null;
};

export function NetworkAssessmentReview({ rows }: { rows: AssessmentRow[] }) {
  const { mutate, isPending } = useAdminMutation();

  function publish(row: AssessmentRow) {
    void mutate({
      key: `network-assessment:publish:${row.id}`,
      pendingMessage: "正在发布 assessment head...",
      action: () =>
        publishNetworkAssessmentAction({
          candidateId: row.candidateId,
          audienceProfileKey: row.audienceProfileKey,
          snapshotId: row.id,
          expectedHeadRevision: row.headRevision ?? undefined,
          idempotencyKey: `cms-publish-${row.id}-${Date.now()}`,
          reason: "CMS 独立审核后发布",
        }),
      errorTitle: "assessment 发布失败",
      errorSuggestion: "请确认候选仍为 active、revision 未漂移且快照未过期。",
    });
  }

  function withdraw(row: AssessmentRow) {
    if (!row.headRevision || row.headSnapshotId !== row.id) return;
    void mutate({
      key: `network-assessment:withdraw:${row.id}`,
      pendingMessage: "正在撤销 assessment head...",
      action: () =>
        withdrawNetworkAssessmentAction({
          candidateId: row.candidateId,
          audienceProfileKey: row.audienceProfileKey,
          expectedHeadRevision: row.headRevision!,
          idempotencyKey: `cms-withdraw-${row.id}-${Date.now()}`,
          reason: "CMS 复核后撤销",
        }),
      errorTitle: "assessment 撤销失败",
    });
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border/70">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2">快照</th><th className="px-3 py-2">观测窗口</th><th className="px-3 py-2">版本</th><th className="px-3 py-2">当前 head</th><th className="px-3 py-2">操作</th></tr></thead>
        <tbody className="divide-y divide-border/70">
          {rows.map((row) => {
            const isHead = row.headSnapshotId === row.id;
            return <tr key={row.id}><td className="px-3 py-3"><div className="font-medium">#{row.id} · candidate {row.candidateId}</div><div className="mt-1 text-xs text-muted-foreground">{row.audienceProfileKey}</div></td><td className="px-3 py-3 text-xs text-muted-foreground">{row.observedFrom.toISOString()}<br />{row.observedTo.toISOString()}{row.validUntil ? <><br />validUntil {row.validUntil.toISOString()}</> : null}</td><td className="px-3 py-3 text-xs"><div>{row.formulaVersion}</div><div className="mt-1 break-all font-mono text-muted-foreground">{row.policyChecksum}</div></td><td className="px-3 py-3">{isHead ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="size-4" />r{row.headRevision}</span> : "未发布"}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={() => publish(row)} disabled={isHead || isPending(`network-assessment:publish:${row.id}`)}><CheckCircle2 className="size-4" />发布</Button><Button type="button" size="sm" variant="outline" onClick={() => withdraw(row)} disabled={!isHead || isPending(`network-assessment:withdraw:${row.id}`)}><XCircle className="size-4" />撤销</Button></div></td></tr>;
          })}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">暂无 assessment 快照。</p> : null}
    </div>
  );
}

export function NetworkAssessmentRollbackHint() {
  return <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><RotateCcw className="size-3.5" />发布事件和 head revision 会保留，回滚通过重新发布历史快照完成。</p>;
}
