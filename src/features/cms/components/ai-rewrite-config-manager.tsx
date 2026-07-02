"use client";

import { Fragment, useState } from "react";
import { BrainCircuit, Plus, Trash2 } from "lucide-react";

import {
  createAiRewriteConfigAction,
  deleteAiRewriteConfigAction,
  updateAiRewriteConfigAction,
} from "@/features/cms/actions/ai-rewrite-config";
import { type getAiRewriteConfigs } from "@fwqgo/ai/rewrite-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  defaultBaseRewritePrompt,
  defaultMetadataPrompt,
  defaultMetadataStylePrompt,
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

function ConfigForm({
  config,
  onDone,
}: {
  config?: Config;
  onDone?: () => void;
}) {
  const [provider, setProvider] = useState<"deepseek" | "openai" | "compatible">(
    config?.provider ?? "deepseek",
  );
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
        await updateAiRewriteConfigAction(config.id, formData);
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
        await createAiRewriteConfigAction(formData);
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
      className="grid gap-4 rounded-lg border border-border/70 bg-muted/20 p-4"
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
            placeholder={config?.hasApiKey ? `已配置 ${config.apiKeyPreview ?? ""}，留空保留` : "sk-..."}
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
          <Label>Max Tokens</Label>
          <Input
            name="maxTokens"
            type="number"
            min={1000}
            max={64000}
            defaultValue={config?.maxTokens ?? 8192}
            required
          />
        </div>
      </div>

      <div id="prompt-template" className="scroll-mt-24 space-y-2">
        <input
          type="hidden"
          name="basePrompt"
          value={config?.basePrompt ?? defaultBaseRewritePrompt}
        />
        <input
          type="hidden"
          name="metadataPrompt"
          value={config?.metadataPrompt ?? defaultMetadataPrompt}
        />
        <Label>正文改写风格</Label>
        <Textarea
          name="stylePrompt"
          className="min-h-28"
          defaultValue={config?.stylePrompt ?? defaultStylePrompt}
          required
        />
      </div>

      <div className="space-y-2">
        <Label>标题 / SEO 生成风格</Label>
        <Textarea
          name="metadataStylePrompt"
          className="min-h-32"
          defaultValue={
            config?.metadataStylePrompt ?? defaultMetadataStylePrompt
          }
          required
        />
        <p className="text-xs leading-5 text-muted-foreground">
          这里只影响标题、摘要、关键词、标签和英文 SEO 元信息，不会改变正文语气、结构或段落表达。
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            启用
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
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
  const [showCreate, setShowCreate] = useState(configs.length === 0);
  const [editId, setEditId] = useState<number | null>(null);

  async function handleDelete(id: number) {
    const config = configs.find((item) => item.id === id);
    try {
      await deleteAiRewriteConfigAction(id);
      notifySuccess({
        title: "AI 改写配置已删除",
        description: describeAdminResult([
          config?.name,
          config?.model,
          "后续任务不会再使用这套配置",
        ]),
      });
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

      {showCreate ? <ConfigForm onDone={() => setShowCreate(false)} /> : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>服务</TableHead>
            <TableHead>模型</TableHead>
            <TableHead>风格</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-center">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {configs.map((config) => (
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
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(config.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {editId === config.id ? (
                <TableRow>
                  <TableCell colSpan={7} className="bg-muted/20">
                    <ConfigForm config={config} onDone={() => setEditId(null)} />
                  </TableCell>
                </TableRow>
              ) : null}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
