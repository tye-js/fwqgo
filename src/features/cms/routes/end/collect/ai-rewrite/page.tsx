import {
  AdminPageShell,
  AdminSectionCard,
  AdminSummaryStrip,
} from "@/app/_components/admin-page-shell";
import { AiRewriteConfigManager } from "@/app/_components/ai-rewrite-config-manager";
import { getAiRewriteConfigList } from "@/app/_actions/ai-rewrite-config";

export default async function AiRewriteConfigPage() {
  const configs = await getAiRewriteConfigList();
  const enabledCount = configs.filter((config) => config.enabled).length;
  const defaultConfig = configs.find((config) => config.isDefault);

  return (
    <AdminPageShell
      badge="采集配置"
      title="AI 改写配置"
      description="配置 DeepSeek、OpenAI 官方接口或第三方 OpenAI 兼容接口，并维护采集改写时使用的文章风格。"
    >
      <AdminSummaryStrip
        items={[
          {
            label: "配置数量",
            value: String(configs.length),
            note: "可用 AI 服务配置",
          },
          {
            label: "已启用",
            value: String(enabledCount),
            note: "抓取改写时可选择",
          },
          {
            label: "默认配置",
            value: defaultConfig?.styleName ?? "未设置",
            note: defaultConfig?.model ?? "采集改写会回退到任一启用配置",
          },
        ]}
      />
      <AdminSectionCard
        title="改写服务"
        description="API Key 不会在页面完整回显；编辑时留空会保留原密钥。第三方接口只要兼容 /v1/chat/completions 即可接入。"
      >
        <AiRewriteConfigManager configs={configs} />
      </AdminSectionCard>
    </AdminPageShell>
  );
}
