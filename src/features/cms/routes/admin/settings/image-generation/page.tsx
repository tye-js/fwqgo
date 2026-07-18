import { connection } from "next/server";

import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { ImageGenerationConfigManager } from "@/features/cms/components/image-generation-config-manager";
import { getImageGenerationConfigList } from "@/features/cms/actions/image-generation-config";
import {
  AdminSectionNav,
  modelSettingsNavItems,
} from "@/features/cms/components/admin-section-nav";

export default async function ImageGenerationSettingsPage() {
  await connection();

  const result = await getImageGenerationConfigList()
    .then((configs) => ({ configs, error: null }))
    .catch((error: unknown) => {
      console.error("生图配置页加载失败:", error);
      return {
        configs: [] as Awaited<ReturnType<typeof getImageGenerationConfigList>>,
        error: error instanceof Error ? error.message : "未知错误",
      };
    });
  const { configs } = result;

  return (
    <AdminPageShell
      badge="设置"
      title="生图配置"
    >
      <AdminSectionNav
        label="模型与接口"
        currentHref="/settings/image-generation"
        items={modelSettingsNavItems}
      />
      {result.error ? (
        <AdminSectionCard
          title="生图配置加载失败"
          description="无法读取现有配置，暂时不要新增或修改。请检查数据库连接、迁移状态或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{result.error}</p>
        </AdminSectionCard>
      ) : null}
      <AdminSectionCard
        title="封面图生成服务"
        description="API Key 不会完整回显；编辑时留空会保留原密钥。生成后的图片会自动写入图片资产并转为 WebP。"
      >
        {result.error ? null : (
          <ImageGenerationConfigManager configs={configs} />
        )}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
