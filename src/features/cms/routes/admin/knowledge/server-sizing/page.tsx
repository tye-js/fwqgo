import { connection } from "next/server";

import { getServerSizingRulesAdmin } from "@/features/cms/actions/server-sizing";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { ServerSizingRuleManager } from "@/features/cms/components/server-sizing-rule-manager";

export default async function ServerSizingRulesAdminPage() {
  await connection();
  let rules: Awaited<ReturnType<typeof getServerSizingRulesAdmin>> = [];
  let loadError: unknown = null;
  try {
    rules = await getServerSizingRulesAdmin();
  } catch (error) {
    loadError = error;
  }
  if (loadError) {
    return (
      <AdminPageShell badge="决策工具" title="服务器配置规则工作台">
        <AdminSectionCard title="规则目录暂时不可用">
          <p className="text-sm text-destructive">
            {loadError instanceof Error
              ? loadError.message
              : "请先执行决策基础迁移"}
          </p>
        </AdminSectionCard>
      </AdminPageShell>
    );
  }
  return (
    <AdminPageShell
      badge="决策工具"
      title="服务器配置规则工作台"
      description="规则集必须先保存为 draft，由不同管理员审核后发布；已发布/已退休版本只读，变更通过克隆新草稿完成。"
    >
      <AdminSectionCard
        title="规则版本"
        description="公开工具只读取当前 published 规则；配置输入仍在浏览器本地计算。"
      >
        <ServerSizingRuleManager rules={rules} />
      </AdminSectionCard>
      <AdminSectionCard
        title="规则版本目录"
        description="公开工具只读取当前 published 规则；配置输入仍在浏览器本地计算。"
      >
        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">版本</th>
                <th className="px-3 py-2">状态</th>
                <th className="px-3 py-2">引擎 / schema</th>
                <th className="px-3 py-2">checksum</th>
                <th className="px-3 py-2">审核 / 发布</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="px-3 py-3 font-medium">
                    {rule.versionLabel}
                    <div className="mt-1 text-xs text-muted-foreground">
                      r{rule.revision}
                    </div>
                  </td>
                  <td className="px-3 py-3">{rule.status}</td>
                  <td className="px-3 py-3 text-xs">
                    {rule.engineVersion}
                    <br />
                    schema {rule.schemaVersion}
                  </td>
                  <td className="max-w-[240px] break-all px-3 py-3 font-mono text-xs text-muted-foreground">
                    {rule.checksum}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {rule.reviewedBy ?? "未审核"}
                    <br />
                    {rule.publishedBy ?? "未发布"}
                  </td>
                </tr>
              ))}
              {rules.length === 0 ? (
                <tr>
                  <td
                    className="px-3 py-8 text-center text-muted-foreground"
                    colSpan={5}
                  >
                    暂无规则集；首版规则需通过独立发布流程登记来源和黄金场景。
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
