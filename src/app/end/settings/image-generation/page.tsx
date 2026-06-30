import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/app/_components/admin-page-shell";
import { ImageGenerationConfigManager } from "@/app/_components/image-generation-config-manager";
import { getImageGenerationConfigList } from "@/app/_actions/image-generation-config";

export default async function ImageGenerationSettingsPage() {
  const configs = await getImageGenerationConfigList();
  const enabledCount = configs.filter((config) => config.enabled).length;
  const defaultConfig = configs.find((config) => config.isDefault);

  return (
    <AdminPageShell
      badge="设置"
      title="生图配置"
      description="配置文章封面图生成接口，支持 OpenAI 官方、image2 或第三方 OpenAI 兼容生图服务。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "配置数量",
            value: String(configs.length),
            note: "可用生图服务配置",
          },
          {
            label: "已启用",
            value: String(enabledCount),
            note: "文章页可调用",
          },
          {
            label: "默认配置",
            value: defaultConfig?.name ?? "未设置",
            note: defaultConfig?.model ?? "生成封面时会回退到任一启用配置",
          },
        ]}
      />
      <AdminSectionCard
        title="封面图生成服务"
        description="API Key 不会完整回显；编辑时留空会保留原密钥。生成后的图片会自动写入图片资产并转为 WebP。"
      >
        <ImageGenerationConfigManager configs={configs} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
