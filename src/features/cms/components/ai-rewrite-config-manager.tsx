"use client";

import { Fragment, useId, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  BrainCircuit,
  Loader2,
  Plus,
  Star,
  Trash2,
} from "lucide-react";

import {
  checkAiRewriteConfigStatusAction,
  createAiRewriteConfigAction,
  deleteAiRewriteConfigAction,
  setAiRewriteConfigEnabledAction,
  setDefaultAiRewriteConfigAction,
  updateAiRewriteConfigAction,
} from "@/features/cms/actions/ai-rewrite-config";
import { type AiRewriteStatusCheckResult } from "@fwqgo/ai/rewrite-status-check";
import type { getAiRewriteConfigs } from "@fwqgo/ai/rewrite-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  describeAdminResult,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";
import { unwrapAdminActionResult } from "@/lib/admin-action-result";
import {
  defaultBaseRewritePrompt,
  defaultEnglishContentPrompt,
  defaultEnglishContinuationPrompt,
  defaultEnglishMetadataPrompt,
  defaultEnglishMetadataStylePrompt,
  defaultEnglishStylePrompt,
  defaultFactExtractionPrompt,
  defaultInitialRewriteFeedbackPrompt,
  defaultMetadataPrompt,
  defaultMetadataStylePrompt,
} from "@fwqgo/core/ai-rewrite-prompts";
import { defaultProviderCatalogDiscoveryPrompt } from "@fwqgo/core/provider-catalog-discovery";
import { useConfirmUnsavedChanges } from "@/features/cms/hooks/use-confirm-unsaved-changes";

type Config = Awaited<ReturnType<typeof getAiRewriteConfigs>>[number];

const interfacePresets = {
  deepseekOfficial: {
    provider: "deepseek",
    name: "DeepSeek 官方",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  deepseekRelay: {
    provider: "compatible",
    name: "DeepSeek 第三方中转",
    baseUrl: "",
    model: "deepseek-chat",
  },
  openaiOfficial: {
    provider: "openai",
    name: "OpenAI 官方",
    baseUrl: "https://api.openai.com",
    model: "gpt-4.1-mini",
  },
  compatible: {
    provider: "compatible",
    name: "第三方中转 / OpenAI 兼容",
    baseUrl: "",
    model: "gpt-4.1-mini",
  },
} as const;

type InterfacePreset = keyof typeof interfacePresets;

function resolveInterfacePreset(config?: Config): InterfacePreset {
  if (config?.provider === "openai") return "openaiOfficial";
  if (config?.provider === "compatible") {
    return config.model.toLowerCase().startsWith("deepseek-")
      ? "deepseekRelay"
      : "compatible";
  }
  return "deepseekOfficial";
}

function describeProvider(config: Config) {
  if (config.provider === "deepseek") return "DeepSeek 官方";
  if (config.provider === "openai") return "OpenAI 官方";
  return config.model.toLowerCase().startsWith("deepseek-")
    ? "DeepSeek 第三方中转"
    : "第三方中转 / OpenAI 兼容";
}

const defaultStylePrompt =
  "保持服务器/VPS文章的专业评测风格，只对原文做小幅改写和排版整理。保留原文中的表格、价格、配置、优惠码、官网链接和返利链接，不新增外部信息。";

function appendBoolean(formData: FormData, key: string, value: boolean) {
  formData.set(key, value ? "true" : "false");
}

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getCreateTemplate(configs: Config[]) {
  return (
    configs.find((config) => config.enabled && config.isDefault) ??
    configs.find((config) => config.enabled) ??
    configs[0]
  );
}

function getUniqueCopyName(template: Config, configs: Config[]) {
  const names = new Set(configs.map((config) => config.name.trim()));
  const baseName = `${template.name.trim()} 副本`;

  if (!names.has(baseName)) return baseName;

  for (let copyNumber = 2; copyNumber <= configs.length + 1; copyNumber += 1) {
    const candidate = `${baseName} ${copyNumber}`;
    if (!names.has(candidate)) return candidate;
  }

  return `${baseName} ${template.id}`;
}

function formatCheckTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function CheckResultPanel({ result }: { result: AiRewriteStatusCheckResult }) {
  return (
    <div className="rounded-md border border-border/70 bg-background p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={result.success ? "default" : "destructive"}>
          {result.success ? "接口正常" : result.errorTitle}
        </Badge>
        <Badge variant="outline">{result.model ?? "未记录模型"}</Badge>
        {result.latencyMs !== null ? (
          <Badge variant="outline">{result.latencyMs}ms</Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {formatCheckTime(result.checkedAt)}
        </span>
      </div>
      <div className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
        <p>
          地址：
          {result.endpointOrigin
            ? `${result.endpointOrigin}${result.endpointPath ?? ""}`
            : "未完成请求"}
        </p>
        {result.success ? (
          <>
            <p>
              返回：{result.responsePreview || "空"} · finish_reason{" "}
              {result.finishReason ?? "-"}
            </p>
            <p>
              Tokens：prompt {result.promptTokens ?? "-"} · completion{" "}
              {result.completionTokens ?? "-"} · total{" "}
              {result.totalTokens ?? "-"}
            </p>
          </>
        ) : (
          <>
            <p className="break-words text-destructive">{result.error}</p>
            <p>建议：{result.suggestion}</p>
          </>
        )}
      </div>
    </div>
  );
}

function PromptTemplateField({
  name,
  label,
  value,
  variables = [],
  description,
  className = "min-h-56",
}: {
  name: string;
  label: string;
  value: string;
  variables?: string[];
  description: string;
  className?: string;
}) {
  const fieldId = useId();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={fieldId}>{label}</Label>
        {variables.map((variable) => (
          <Badge key={variable} variant="outline" className="font-mono text-xs">
            {`{${variable}}`}
          </Badge>
        ))}
      </div>
      <Textarea
        id={fieldId}
        name={name}
        className={`${className} resize-y font-mono text-xs leading-5`}
        defaultValue={value}
        required
      />
      <p className="text-xs leading-5 text-muted-foreground">{description}</p>
    </div>
  );
}

function ConfigForm({
  config,
  templateConfig,
  suggestedName,
  onDone,
}: {
  config?: Config;
  templateConfig?: Config;
  suggestedName?: string;
  onDone?: () => void;
}) {
  const defaults = config ?? templateConfig;
  const formId = useId();
  const initialPreset = resolveInterfacePreset(defaults);
  const [interfacePreset, setInterfacePreset] =
    useState<InterfacePreset>(initialPreset);
  const [name, setName] = useState(
    config?.name ?? suggestedName ?? interfacePresets[initialPreset].name,
  );
  const [baseUrl, setBaseUrl] = useState(
    defaults?.baseUrl ?? interfacePresets[initialPreset].baseUrl,
  );
  const [model, setModel] = useState(
    defaults?.model ?? interfacePresets[initialPreset].model,
  );
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [isDefault, setIsDefault] = useState(config?.isDefault ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useConfirmUnsavedChanges(
    isDirty && !isSaving,
    "AI 改写配置尚未保存，确定离开吗？",
  );

  function handlePresetChange(value: InterfacePreset) {
    const preset = interfacePresets[value];
    setInterfacePreset(value);
    setName(preset.name);
    setBaseUrl(preset.baseUrl);
    setModel(preset.model);
    setIsDirty(true);
  }

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    formData.set("provider", interfacePresets[interfacePreset].provider);
    appendBoolean(formData, "enabled", enabled);
    appendBoolean(formData, "isDefault", isDefault);

    try {
      if (config) {
        unwrapAdminActionResult(
          await updateAiRewriteConfigAction(config.id, formData),
        );
        notifySuccess({
          title: "AI 改写配置已更新",
          description: describeAdminResult([
            stringValue(formData, "name"),
            stringValue(formData, "model"),
            enabled ? "已启用" : "已停用",
            isDefault ? "默认配置" : null,
          ]),
        });
      } else {
        unwrapAdminActionResult(await createAiRewriteConfigAction(formData));
        notifySuccess({
          title: "AI 改写配置已添加",
          description: describeAdminResult([
            stringValue(formData, "name"),
            stringValue(formData, "model"),
            enabled ? "已启用" : "已停用",
            "可在内容生产台选择该改写风格",
          ]),
        });
      }
      setIsDirty(false);
      onDone?.();
    } catch (error) {
      notifyError({
        title: config ? "AI 改写配置更新失败" : "AI 改写配置添加失败",
        description: describeAdminResult([
          stringValue(formData, "name"),
          error instanceof Error ? error.message : "保存失败",
          "请检查 Base URL、模型名称、API Key 和数值范围",
        ]),
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      action={handleSubmit}
      onChangeCapture={() => setIsDirty(true)}
      className="grid gap-4 rounded-md border border-border/70 bg-muted/20 p-4"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-interface-preset`}>接口预设</Label>
          <Select
            value={interfacePreset}
            onValueChange={(value) =>
              handlePresetChange(value as InterfacePreset)
            }
          >
            <SelectTrigger id={`${formId}-interface-preset`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepseekOfficial">DeepSeek 官方</SelectItem>
              <SelectItem value="deepseekRelay">DeepSeek 第三方中转</SelectItem>
              <SelectItem value="openaiOfficial">OpenAI 官方</SelectItem>
              <SelectItem value="compatible">
                其他第三方中转 / OpenAI 兼容
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>配置名称</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-model`}>模型</Label>
          <Input
            id={`${formId}-model`}
            name="model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            required
          />
          <p className="text-xs leading-5 text-muted-foreground">
            填写中转站实际暴露的模型 ID，例如 deepseek-chat、deepseek-reasoner
            或中转站自定义名称。
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-base-url`}>Base URL</Label>
          <Input
            id={`${formId}-base-url`}
            name="baseUrl"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://relay.example.com/v1"
            required
          />
          <p className="text-xs leading-5 text-muted-foreground">
            支持根地址、以 /v1 结尾的地址或完整 /chat/completions
            地址，系统会自动补全请求路径。
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-api-key`}>API Key</Label>
          <Input
            id={`${formId}-api-key`}
            name="apiKey"
            type="password"
            placeholder={
              config?.hasApiKey
                ? `已配置 ${config.apiKeyPreview ?? ""}，留空保留`
                : "sk-..."
            }
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_120px_180px_160px]">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-style-name`}>风格名称</Label>
          <Input
            id={`${formId}-style-name`}
            name="styleName"
            defaultValue={defaults?.styleName ?? "服务器推广专业评测"}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-temperature`}>Temperature</Label>
          <Input
            id={`${formId}-temperature`}
            name="temperature"
            type="number"
            min={0}
            max={200}
            defaultValue={defaults?.temperature ?? 40}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-max-tokens`}>
            Max Tokens（中文 / 英文）
          </Label>
          <Input
            id={`${formId}-max-tokens`}
            name="maxTokens"
            type="number"
            min={1000}
            max={64000}
            defaultValue={defaults?.maxTokens ?? 8192}
            required
          />
          <p className="text-xs leading-5 text-muted-foreground">
            同时限制中文正文改写、英文正文生成的 Markdown 输入长度和模型输出
            max_tokens。
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-rewrite-count`}>中文正文调用次数</Label>
          <Input
            id={`${formId}-rewrite-count`}
            value="1"
            readOnly
            aria-readonly="true"
          />
          <p className="text-xs leading-5 text-muted-foreground">
            固定生成 1 次，不再自动重写。
          </p>
        </div>
      </div>

      <details id="prompt-template" open className="scroll-mt-24 border-t pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          中文改写提示词
        </summary>
        <div className="mt-4 space-y-6">
          <PromptTemplateField
            name="factExtractionPrompt"
            label="1. 来源信息提取 Prompt"
            value={
              defaults?.factExtractionPrompt ?? defaultFactExtractionPrompt
            }
            variables={["sourceMarkdown"]}
            description="整理来源信息供正文组织和 SEO 使用，不执行独立事实审查。"
          />
          <PromptTemplateField
            name="stylePrompt"
            label="2. 中文正文风格片段"
            value={defaults?.stylePrompt ?? defaultStylePrompt}
            description="通过 {stylePrompt} 注入中文正文完整模板。"
            className="min-h-28"
          />
          <PromptTemplateField
            name="basePrompt"
            label="3. 中文正文完整 Prompt"
            value={defaults?.basePrompt ?? defaultBaseRewritePrompt}
            variables={[
              "stylePrompt",
              "sourceContent",
              "factSheet",
              "outline",
              "protectedContent",
              "retryFeedback",
            ]}
            description="每次候选正文只基于清洗后的原文做小幅改写和排版整理，不追加独立事实审查。"
            className="min-h-72 lg:min-h-[34rem]"
          />
          <PromptTemplateField
            name="initialRewritePrompt"
            label="4. 首轮反馈 Prompt"
            value={
              defaults?.initialRewritePrompt ??
              defaultInitialRewriteFeedbackPrompt
            }
            description="首轮生成时填入正文模板的 {retryFeedback}。"
            className="min-h-24"
          />
          <PromptTemplateField
            name="metadataStylePrompt"
            label="5. 中文标题 / SEO 风格片段"
            value={defaults?.metadataStylePrompt ?? defaultMetadataStylePrompt}
            description="通过 {metadataStylePrompt} 注入中文元信息完整模板。"
            className="min-h-28"
          />
          <PromptTemplateField
            name="metadataPrompt"
            label="6. 中文标题 / SEO 完整 Prompt"
            value={defaults?.metadataPrompt ?? defaultMetadataPrompt}
            variables={["metadataStylePrompt", "markdownContent"]}
            description="用于标题、摘要、关键词、标签和推荐标签生成。"
            className="min-h-72 lg:min-h-[28rem]"
          />
        </div>
      </details>

      <details className="border-t pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          英文正文与 SEO 提示词
        </summary>
        <div className="mt-4 space-y-6">
          <PromptTemplateField
            name="englishStylePrompt"
            label="1. 英文正文风格片段"
            value={defaults?.englishStylePrompt ?? defaultEnglishStylePrompt}
            description="通过 {englishStylePrompt} 注入英文正文完整模板。"
            className="min-h-28"
          />
          <PromptTemplateField
            name="englishContentPrompt"
            label="2. 英文正文完整 Prompt"
            value={
              defaults?.englishContentPrompt ?? defaultEnglishContentPrompt
            }
            variables={[
              "englishStylePrompt",
              "title",
              "description",
              "keywords",
              "markdownContent",
            ]}
            description="用于从已完成改写的中文正文生成英文 Markdown。"
            className="min-h-72 lg:min-h-[30rem]"
          />
          <PromptTemplateField
            name="englishContinuationPrompt"
            label="3. 英文正文续写 Prompt"
            value={
              defaults?.englishContinuationPrompt ??
              defaultEnglishContinuationPrompt
            }
            variables={["originalPrompt", "generatedContentTail"]}
            description="仅在英文正文因长度被截断时使用，每次续写都会单独保存。"
            className="min-h-52"
          />
          <PromptTemplateField
            name="englishMetadataStylePrompt"
            label="4. 英文标题 / SEO 风格片段"
            value={
              defaults?.englishMetadataStylePrompt ??
              defaultEnglishMetadataStylePrompt
            }
            description="通过 {englishMetadataStylePrompt} 注入英文元信息完整模板。"
            className="min-h-28"
          />
          <PromptTemplateField
            name="englishMetadataPrompt"
            label="5. 英文标题 / SEO 完整 Prompt"
            value={
              defaults?.englishMetadataPrompt ?? defaultEnglishMetadataPrompt
            }
            variables={[
              "englishMetadataStylePrompt",
              "title",
              "description",
              "keywords",
              "categoryContext",
              "enContent",
            ]}
            description="用于英文标题、slug、摘要、关键词、标签和分类元信息。"
            className="min-h-72 lg:min-h-[32rem]"
          />
        </div>
      </details>

      <details className="border-t pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          供应商套餐源发现提示词
        </summary>
        <div className="mt-4">
          <PromptTemplateField
            name="providerCatalogDiscoveryPrompt"
            label="公开套餐目录结构映射 Prompt"
            value={
              defaults?.providerCatalogDiscoveryPrompt ??
              defaultProviderCatalogDiscoveryPrompt
            }
            variables={["providerName", "officialUrl", "pagesJson"]}
            description="一次性扫描时发送给模型的完整用户提示词。系统不追加隐藏业务提示词；实际提示词和模型原始输出都会保留在扫描记录中。"
            className="min-h-72 lg:min-h-[34rem]"
          />
        </div>
      </details>

      <div className="cms-mobile-save-bar flex flex-wrap items-center justify-between gap-4 rounded-md border border-border/70 bg-background/95 p-3 shadow-sm backdrop-blur">
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => {
                setEnabled(checked);
                if (!checked) setIsDefault(false);
                setIsDirty(true);
              }}
            />
            启用
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={isDefault}
              onCheckedChange={(checked) => {
                setIsDefault(checked);
                if (checked) setEnabled(true);
                setIsDirty(true);
              }}
            />
            默认改写配置
          </label>
        </div>
        <Button type="submit" disabled={isSaving}>
          <BrainCircuit className="size-4" />
          {isSaving ? "保存中..." : "保存配置"}
        </Button>
      </div>
    </form>
  );
}

export function AiRewriteConfigManager({ configs }: { configs: Config[] }) {
  const router = useRouter();
  const createTemplate = getCreateTemplate(configs);
  const suggestedCreateName = createTemplate
    ? getUniqueCopyName(createTemplate, configs)
    : undefined;
  const [showCreate, setShowCreate] = useState(configs.length === 0);
  const [editId, setEditId] = useState<number | null>(null);
  const [checkingId, setCheckingId] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    id: number;
    type: "enabled" | "default";
  } | null>(null);
  const [checkResults, setCheckResults] = useState<
    Record<number, AiRewriteStatusCheckResult>
  >({});

  async function handleCheck(id: number) {
    const config = configs.find((item) => item.id === id);
    setCheckingId(id);

    try {
      const result = await checkAiRewriteConfigStatusAction(id);
      setCheckResults((current) => ({ ...current, [id]: result }));

      if (result.success) {
        notifySuccess({
          title: "AI 接口检测通过",
          description: describeAdminResult([
            result.configName,
            result.model,
            `${result.latencyMs}ms`,
            result.responsePreview,
          ]),
        });
        return;
      }

      notifyError({
        title: result.errorTitle,
        description: describeAdminResult([
          result.configName ?? config?.name,
          result.error,
          result.suggestion,
        ]),
      });
    } catch (error) {
      notifyError({
        title: "AI 接口检测失败",
        description: describeAdminResult([
          config?.name,
          error instanceof Error ? error.message : "检测请求失败",
        ]),
      });
    } finally {
      setCheckingId(null);
    }
  }

  async function handleEnabledChange(id: number, enabled: boolean) {
    const config = configs.find((item) => item.id === id);
    setPendingAction({ id, type: "enabled" });

    try {
      unwrapAdminActionResult(
        await setAiRewriteConfigEnabledAction(id, enabled),
      );
      notifySuccess({
        title: enabled ? "AI 改写配置已启用" : "AI 改写配置已停用",
        description: describeAdminResult([
          config?.name,
          !enabled && config?.isDefault
            ? "默认状态已同步更新；如有其他启用配置，系统会自动设为默认"
            : null,
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "AI 改写配置状态更新失败",
        description: describeAdminResult([
          config?.name,
          error instanceof Error ? error.message : "状态更新失败",
        ]),
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSetDefault(id: number) {
    const config = configs.find((item) => item.id === id);
    setPendingAction({ id, type: "default" });

    try {
      unwrapAdminActionResult(await setDefaultAiRewriteConfigAction(id));
      notifySuccess({
        title: "默认 AI 改写配置已更新",
        description: describeAdminResult([
          config?.name,
          config?.enabled ? null : "配置已同时启用",
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "默认 AI 改写配置更新失败",
        description: describeAdminResult([
          config?.name,
          error instanceof Error ? error.message : "默认配置更新失败",
        ]),
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDelete(id: number) {
    const config = configs.find((item) => item.id === id);
    try {
      unwrapAdminActionResult(await deleteAiRewriteConfigAction(id));
      notifySuccess({
        title: "AI 改写配置已删除",
        description: describeAdminResult([
          config?.name,
          config?.model,
          "后续任务不会再使用这套配置",
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "AI 改写配置删除失败",
        description: describeAdminResult([
          config?.name,
          error instanceof Error ? error.message : "删除失败",
        ]),
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => setShowCreate((value) => !value)}
        >
          <Plus className="size-4" />
          添加配置
        </Button>
      </div>

      {showCreate ? (
        <ConfigForm
          templateConfig={createTemplate}
          suggestedName={suggestedCreateName}
          onDone={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
        <Table className="cms-mobile-sticky-actions min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>服务</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>风格</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>接口检测</TableHead>
              <TableHead className="text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((config) => {
              const checkResult = checkResults[config.id];

              return (
                <Fragment key={config.id}>
                  <TableRow>
                    <TableCell className="font-medium">{config.name}</TableCell>
                    <TableCell>{describeProvider(config)}</TableCell>
                    <TableCell>{config.model}</TableCell>
                    <TableCell>{config.styleName}</TableCell>
                    <TableCell>
                      {config.hasApiKey ? config.apiKeyPreview : "未配置"}
                    </TableCell>
                    <TableCell className="min-w-64">
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="flex h-11 items-center gap-2 text-sm">
                          <Switch
                            checked={config.enabled}
                            disabled={pendingAction !== null}
                            aria-label={`${config.enabled ? "停用" : "启用"} AI 改写配置：${config.name}`}
                            onCheckedChange={(enabled) =>
                              void handleEnabledChange(config.id, enabled)
                            }
                          />
                          <span>{config.enabled ? "已启用" : "已停用"}</span>
                        </label>
                        <Button
                          type="button"
                          variant={config.isDefault ? "secondary" : "outline"}
                          size="sm"
                          className="h-11"
                          disabled={pendingAction !== null || config.isDefault}
                          onClick={() => void handleSetDefault(config.id)}
                        >
                          {pendingAction?.id === config.id &&
                          pendingAction.type === "default" ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Star
                              className="size-4"
                              fill={config.isDefault ? "currentColor" : "none"}
                            />
                          )}
                          {config.isDefault ? "默认配置" : "设为默认"}
                        </Button>
                        {pendingAction?.id === config.id &&
                        pendingAction.type === "enabled" ? (
                          <Loader2
                            className="size-4 animate-spin text-muted-foreground"
                            aria-label="正在更新状态"
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={checkingId === config.id}
                        onClick={() => handleCheck(config.id)}
                      >
                        {checkingId === config.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Activity className="size-4" />
                        )}
                        {checkingId === config.id ? "检测中" : "检测"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setEditId(editId === config.id ? null : config.id)
                          }
                        >
                          编辑
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              <Trash2 className="size-4" />
                              删除
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                删除这套 AI 改写配置？
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                删除后后续任务不会再使用这套配置，当前配置为
                                <span className="mt-2 block font-medium text-destructive">
                                  {config.name} / {config.model}
                                </span>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>取消</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(config.id)}
                              >
                                确定删除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                  {checkResult ? (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/20">
                        <CheckResultPanel result={checkResult} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {editId === config.id ? (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/20">
                        <ConfigForm
                          config={config}
                          onDone={() => {
                            setEditId(null);
                            router.refresh();
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
            {configs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="h-28 text-center text-sm text-muted-foreground"
                >
                  暂无 AI 改写配置。请先添加并启用一套配置，再创建内容生产任务。
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
