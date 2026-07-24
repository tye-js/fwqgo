"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, BrainCircuit, Loader2, Plus, Trash2 } from "lucide-react";

import {
  checkAiRewriteConfigStatusAction,
  createAiRewriteConfigAction,
  deleteAiRewriteConfigAction,
  updateAiRewriteConfigAction,
} from "@/features/cms/actions/ai-rewrite-config";
import { type AiRewriteStatusCheckResult } from "@fwqgo/ai/rewrite-status-check";
import { type getAiRewriteConfigs } from "@fwqgo/ai/rewrite-config";
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
  defaultQualityReviewPrompt,
  defaultRewriteRetryPrompt,
} from "@fwqgo/core/ai-rewrite-prompts";

type Config = Awaited<ReturnType<typeof getAiRewriteConfigs>>[number];

const providerDefaults = {
  deepseek: {
    name: "DeepSeek 官方",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
  },
  openai: {
    name: "OpenAI 官方",
    baseUrl: "https://api.openai.com",
    model: "gpt-4.1-mini",
  },
  compatible: {
    name: "第三方 OpenAI 兼容",
    baseUrl: "https://api.example.com",
    model: "gpt-4.1-mini",
  },
};

const defaultStylePrompt =
  "保持服务器/VPS推广文章的专业评测风格，强化商家特点、配置、线路、价格、优惠码、适用场景和SEO长尾词。保留原文中的表格、价格、配置、优惠码、官网链接和返利链接，不要编造不存在的信息。";

function appendBoolean(formData: FormData, key: string, value: boolean) {
  formData.set(key, value ? "true" : "false");
}

function stringValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
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
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={name}>{label}</Label>
        {variables.map((variable) => (
          <Badge key={variable} variant="outline" className="font-mono text-xs">
            {`{${variable}}`}
          </Badge>
        ))}
      </div>
      <Textarea
        id={name}
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
  onDone,
}: {
  config?: Config;
  onDone?: () => void;
}) {
  const [provider, setProvider] = useState<
    "deepseek" | "openai" | "compatible"
  >(config?.provider ?? "deepseek");
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [isDefault, setIsDefault] = useState(config?.isDefault ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const defaults = providerDefaults[provider];

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    formData.set("provider", provider);
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
      className="grid gap-4 rounded-md border border-border/70 bg-muted/20 p-4"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>服务类型</Label>
          <Select
            value={provider}
            onValueChange={(value) => setProvider(value as typeof provider)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="deepseek">DeepSeek 官方</SelectItem>
              <SelectItem value="openai">OpenAI 官方</SelectItem>
              <SelectItem value="compatible">第三方 OpenAI 兼容</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>配置名称</Label>
          <Input
            name="name"
            defaultValue={config?.name ?? defaults.name}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>模型</Label>
          <Input
            name="model"
            defaultValue={config?.model ?? defaults.model}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
        <div className="space-y-2">
          <Label>Base URL</Label>
          <Input
            name="baseUrl"
            defaultValue={config?.baseUrl ?? defaults.baseUrl}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>API Key</Label>
          <Input
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

      <div className="grid gap-4 md:grid-cols-[minmax(220px,0.4fr)_120px_140px]">
        <div className="space-y-2">
          <Label>风格名称</Label>
          <Input
            name="styleName"
            defaultValue={config?.styleName ?? "服务器推广专业评测"}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Temperature</Label>
          <Input
            name="temperature"
            type="number"
            min={0}
            max={200}
            defaultValue={config?.temperature ?? 40}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Max Tokens（中文 / 英文）</Label>
          <Input
            name="maxTokens"
            type="number"
            min={1000}
            max={64000}
            defaultValue={config?.maxTokens ?? 8192}
            required
          />
          <p className="text-xs leading-5 text-muted-foreground">
            同时限制中文正文改写、英文正文生成的 Markdown 输入长度和模型输出
            max_tokens。
          </p>
        </div>
      </div>

      <details id="prompt-template" open className="scroll-mt-24 border-t pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          中文改写与审查提示词
        </summary>
        <div className="mt-4 space-y-6">
          <PromptTemplateField
            name="factExtractionPrompt"
            label="1. 来源事实提取 Prompt"
            value={config?.factExtractionPrompt ?? defaultFactExtractionPrompt}
            variables={["sourceMarkdown"]}
            description="模型收到的完整事实提取模板。输出会保存到任务审计记录。"
          />
          <PromptTemplateField
            name="stylePrompt"
            label="2. 中文正文风格片段"
            value={config?.stylePrompt ?? defaultStylePrompt}
            description="通过 {stylePrompt} 注入中文正文完整模板。"
            className="min-h-28"
          />
          <PromptTemplateField
            name="basePrompt"
            label="3. 中文正文完整 Prompt"
            value={config?.basePrompt ?? defaultBaseRewritePrompt}
            variables={[
              "stylePrompt",
              "sourceContent",
              "factSheet",
              "outline",
              "providerContext",
              "knowledgeContext",
              "protectedContent",
              "retryFeedback",
            ]}
            description="每轮候选正文实际使用的完整模板，系统只替换变量，不再追加隐藏业务指令。"
            className="min-h-[34rem]"
          />
          <PromptTemplateField
            name="initialRewritePrompt"
            label="4. 首轮反馈 Prompt"
            value={
              config?.initialRewritePrompt ??
              defaultInitialRewriteFeedbackPrompt
            }
            description="首轮生成时填入正文模板的 {retryFeedback}。"
            className="min-h-24"
          />
          <PromptTemplateField
            name="rewriteRetryPrompt"
            label="5. 审查未通过后的重试 Prompt"
            value={config?.rewriteRetryPrompt ?? defaultRewriteRetryPrompt}
            variables={["issues"]}
            description="质量问题会整理为列表并替换 {issues}，再传给下一轮正文生成。"
            className="min-h-32"
          />
          <PromptTemplateField
            name="qualityReviewPrompt"
            label="6. 事实质量审查 Prompt"
            value={config?.qualityReviewPrompt ?? defaultQualityReviewPrompt}
            variables={[
              "sourceContent",
              "factSheet",
              "protectedAuthorityContent",
              "providerContext",
              "knowledgeContext",
              "markdownContent",
            ]}
            description="每一轮候选正文都会使用该模板审查，原始 JSON 和归一化结果都会保留。"
            className="min-h-[34rem]"
          />
          <PromptTemplateField
            name="metadataStylePrompt"
            label="7. 中文标题 / SEO 风格片段"
            value={config?.metadataStylePrompt ?? defaultMetadataStylePrompt}
            description="通过 {metadataStylePrompt} 注入中文元信息完整模板。"
            className="min-h-28"
          />
          <PromptTemplateField
            name="metadataPrompt"
            label="8. 中文标题 / SEO 完整 Prompt"
            value={config?.metadataPrompt ?? defaultMetadataPrompt}
            variables={["metadataStylePrompt", "markdownContent"]}
            description="用于标题、摘要、关键词、标签和推荐标签生成。"
            className="min-h-[28rem]"
          />
        </div>
      </details>

      <details open className="border-t pt-4">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">
          英文正文与 SEO 提示词
        </summary>
        <div className="mt-4 space-y-6">
          <PromptTemplateField
            name="englishStylePrompt"
            label="1. 英文正文风格片段"
            value={config?.englishStylePrompt ?? defaultEnglishStylePrompt}
            description="通过 {englishStylePrompt} 注入英文正文完整模板。"
            className="min-h-28"
          />
          <PromptTemplateField
            name="englishContentPrompt"
            label="2. 英文正文完整 Prompt"
            value={config?.englishContentPrompt ?? defaultEnglishContentPrompt}
            variables={[
              "englishStylePrompt",
              "title",
              "description",
              "keywords",
              "markdownContent",
            ]}
            description="用于从已通过审查的中文正文生成英文 Markdown。"
            className="min-h-[30rem]"
          />
          <PromptTemplateField
            name="englishContinuationPrompt"
            label="3. 英文正文续写 Prompt"
            value={
              config?.englishContinuationPrompt ??
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
              config?.englishMetadataStylePrompt ??
              defaultEnglishMetadataStylePrompt
            }
            description="通过 {englishMetadataStylePrompt} 注入英文元信息完整模板。"
            className="min-h-28"
          />
          <PromptTemplateField
            name="englishMetadataPrompt"
            label="5. 英文标题 / SEO 完整 Prompt"
            value={
              config?.englishMetadataPrompt ?? defaultEnglishMetadataPrompt
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
            className="min-h-[32rem]"
          />
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => {
                setEnabled(checked);
                if (!checked) setIsDefault(false);
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
  const [showCreate, setShowCreate] = useState(configs.length === 0);
  const [editId, setEditId] = useState<number | null>(null);
  const [checkingId, setCheckingId] = useState<number | null>(null);
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
          onDone={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      ) : null}

      <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
        <Table className="min-w-[980px]">
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
                    <TableCell>{config.provider}</TableCell>
                    <TableCell>{config.model}</TableCell>
                    <TableCell>{config.styleName}</TableCell>
                    <TableCell>
                      {config.hasApiKey ? config.apiKeyPreview : "未配置"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {config.enabled ? (
                          <Badge>启用</Badge>
                        ) : (
                          <Badge variant="outline">停用</Badge>
                        )}
                        {config.isDefault ? (
                          <Badge variant="secondary">默认</Badge>
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
