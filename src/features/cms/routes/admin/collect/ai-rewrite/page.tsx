import { connection } from "next/server";

import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { AiRewriteConfigManager } from "@/features/cms/components/ai-rewrite-config-manager";
import { getAiRewriteConfigList } from "@/features/cms/actions/ai-rewrite-config";
import {
  AdminSectionNav,
  modelSettingsNavItems,
} from "@/features/cms/components/admin-section-nav";

export default async function AiRewriteConfigPage() {
  await connection();

  const result = await getAiRewriteConfigList()
    .then((configs) => ({ configs, error: null }))
    .catch((error: unknown) => {
      console.error("AI 改写配置页加载失败:", error);
      return {
        configs: [] as Awaited<ReturnType<typeof getAiRewriteConfigList>>,
        error: error instanceof Error ? error.message : "未知错误",
      };
    });
  const { configs } = result;

  return (
    <AdminPageShell
      badge="采集配置"
      title="AI 改写配置"
    >
      <AdminSectionNav
        label="模型与接口"
        currentHref="/collect/ai-rewrite"
        items={modelSettingsNavItems}
      />
      {result.error ? (
        <AdminSectionCard
          title="AI 改写配置加载失败"
          description="无法读取现有配置，暂时不要新增或修改。请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{result.error}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard
        title="改写服务"
        description="API Key 不会在页面完整回显；编辑时留空会保留原密钥。第三方接口只要兼容 /v1/chat/completions 即可接入。"
      >
        {result.error ? null : <AiRewriteConfigManager configs={configs} />}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
