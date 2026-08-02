import { asc } from "drizzle-orm";
import { connection } from "next/server";

import { requireAdminSession } from "@fwqgo/auth/session";
import { db } from "@fwqgo/db";
import { networkLineCandidates } from "@fwqgo/db/schema";
import {
  getNetworkAssessmentAdmin,
  getNetworkResourceAdmin,
} from "@/features/cms/actions/network-assessment";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { NetworkLineManager } from "@/features/cms/components/network-line-manager";
import { NetworkResourceManager } from "@/features/cms/components/network-resource-manager";
import {
  NetworkAssessmentReview,
  NetworkAssessmentRollbackHint,
} from "@/features/cms/components/network-assessment-review";

export default async function NetworkLinesAdminPage() {
  await connection();
  await requireAdminSession();
  let candidates: Awaited<ReturnType<typeof loadCandidates>>;
  let assessments: Awaited<ReturnType<typeof getNetworkAssessmentAdmin>>;
  let resources: Awaited<ReturnType<typeof getNetworkResourceAdmin>>;
  try {
    [candidates, assessments, resources] = await Promise.all([
      loadCandidates(),
      getNetworkAssessmentAdmin(),
      getNetworkResourceAdmin(),
    ]);
  } catch (error) {
    return (
      <AdminPageShell badge="网络评估" title="运营商线路工作台">
        <AdminSectionCard title="网络评估数据表暂不可用">
          <p className="text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "请先执行决策平台迁移，再打开网络评估工作台。"}
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell
      badge="网络评估"
      title="运营商线路工作台"
      description="候选身份、不可变配置 revision、测量活动和 assessment head 分开管理。没有七天双向证据时只能预览数据不足，不能公开推荐。"
    >
      <AdminSectionCard
        title="候选线路"
        description="候选代表可购买、可定位测试的实际网络产品，不等同于宽泛线路标签。"
      >
        <NetworkLineManager candidates={candidates} />
      </AdminSectionCard>
      <AdminSectionCard
        title="Assessment 审核与发布"
        description="只有当前候选 revision、未过期且证据完整的不可变快照才能切换为公开 head。"
      >
        <NetworkAssessmentReview rows={assessments} />
        <NetworkAssessmentRollbackHint />
      </AdminSectionCard>
      <AdminSectionCard
        title="探针、目标与 credential"
        description="这些资源决定真实测量的 allowlist 和证据归属；不在公共请求中接受任意网络目标。"
      >
        <NetworkResourceManager
          candidates={candidates.map((candidate) => ({
            id: candidate.id,
            name: candidate.name,
            slug: candidate.slug,
          }))}
          resources={resources}
        />
      </AdminSectionCard>
      <AdminSectionCard
        title="候选线路目录"
        description="候选代表可购买、可定位测试的实际网络产品，不等同于宽泛线路标签。"
      >
        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">候选</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">当前配置</th>
                <th className="px-3 py-2">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {candidates.map((candidate) => (
                <tr key={candidate.id}>
                  <td className="px-3 py-3">
                    <div className="font-medium">{candidate.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {candidate.slug}
                      {candidate.enName ? ` · ${candidate.enName}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-3">{candidate.status}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {candidate.currentRevisionId ?? "—"}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {candidate.updatedAt?.toISOString().slice(0, 10) ?? "—"}
                  </td>
                </tr>
              ))}
              {candidates.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-muted-foreground"
                    colSpan={4}
                  >
                    暂无候选。请先登记提供方、机房、实际产品标识和同前缀核验记录。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}

async function loadCandidates() {
  return db
    .select({
      id: networkLineCandidates.id,
      slug: networkLineCandidates.slug,
      name: networkLineCandidates.name,
      enName: networkLineCandidates.enName,
      status: networkLineCandidates.status,
      currentRevisionId: networkLineCandidates.currentConfigurationRevisionId,
      updatedAt: networkLineCandidates.updatedAt,
    })
    .from(networkLineCandidates)
    .orderBy(
      asc(networkLineCandidates.status),
      asc(networkLineCandidates.name),
    );
}
