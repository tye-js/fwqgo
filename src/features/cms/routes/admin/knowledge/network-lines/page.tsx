import { connection } from "next/server";

import { requireAdminSession } from "@fwqgo/auth/session";
import { getNetworkExperienceRulesAdmin } from "@/features/cms/actions/network-experience";
import { AdminPageShell, AdminSectionCard } from "@/features/cms/components/admin-page-shell";
import { NetworkExperienceRuleManager } from "@/features/cms/components/network-experience-rule-manager";

export default async function NetworkLinesAdminPage() {
  await connection();
  await requireAdminSession();
  let rules: Awaited<ReturnType<typeof getNetworkExperienceRulesAdmin>> = [];
  let unavailable = false;
  try {
    rules = await getNetworkExperienceRulesAdmin();
  } catch (error) {
    unavailable = true;
    console.error("Failed to load network experience rules:", error);
  }

  return <AdminPageShell badge="线路经验" title="运营商线路经验工作台" description="维护电信、联通、移动的定性经验规则。这里不采集探针、测速、样本或真实线路数据；公开工具只读取已发布快照并提示用户自行验证。">
    <AdminSectionCard title="经验规则集" description="规则集采用 draft / published / retired 生命周期，发布前必须由不同管理员审核；历史 published 版本不可直接编辑。">
      {unavailable ? <p className="text-sm text-destructive">经验规则数据表暂不可用，请先执行对应数据库迁移。</p> : <NetworkExperienceRuleManager rules={rules} />}
    </AdminSectionCard>
    <AdminSectionCard title="规则编辑边界" description="每条规则必须限定地区、运营商、接入类型、目标区域和业务场景，并同时填写风险码、验证码、来源和复核日期。">
      <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground"><li>排序只表示阅读顺序，不代表性能排名。</li><li>商家标签不能替代实际交付前缀、去回程和高峰测试。</li><li>规则冲突或缺失时公开工具返回 unknown / partial，不使用代码默认结论。</li></ul>
    </AdminSectionCard>
  </AdminPageShell>;
}
