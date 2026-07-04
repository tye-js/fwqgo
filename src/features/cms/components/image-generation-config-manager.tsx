"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Plus, Trash2 } from "lucide-react";

import {
  createImageGenerationConfigAction,
  deleteImageGenerationConfigAction,
  updateImageGenerationConfigAction,
} from "@/features/cms/actions/image-generation-config";
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
import { defaultCoverPromptTemplate } from "@fwqgo/core/image-generation-prompts";
import {
  describeAdminResult,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";

type Config = {
  id: number;
  name: string;
  provider: "openai" | "image2" | "compatible";
  baseUrl: string;
  model: string;
  promptTemplate: string;
  size: string;
  quality: string;
  timeoutSeconds: number;
  enabled: boolean;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyPreview: string | null;
};

const providerDefaults = {
  image2: {
    name: "Image2 生图",
    baseUrl: "https://api.example.com",
    model: "image2",
  },
  openai: {
    name: "OpenAI Images",
    baseUrl: "https://api.openai.com",
    model: "gpt-image-1",
  },
  compatible: {
    name: "第三方兼容生图",
    baseUrl: "https://api.example.com",
    model: "image-model",
  },
};

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
  const [provider, setProvider] = useState<"image2" | "openai" | "compatible">(
    config?.provider ?? "image2",
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
        await updateImageGenerationConfigAction(config.id, formData);
        notifySuccess({
          title: "生图配置已更新",
          description: describeAdminResult([
            stringValue(formData, "name"),
            stringValue(formData, "model"),
            enabled ? "已启用" : "已停用",
            isDefault ? "默认配置" : null,
          ]),
        });
      } else {
        await createImageGenerationConfigAction(formData);
        notifySuccess({
          title: "生图配置已添加",
          description: describeAdminResult([
            stringValue(formData, "name"),
            stringValue(formData, "model"),
            "可在文章编辑页生成封面图",
          ]),
        });
      }
      onDone?.();
    } catch (error) {
      notifyError({
        title: config ? "生图配置更新失败" : "生图配置添加失败",
        description: describeAdminResult([
          stringValue(formData, "name"),
          error instanceof Error ? error.message : "保存失败",
          "请检查 Base URL、模型、API Key、尺寸和超时时间",
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
              <SelectItem value="image2">Image2 / 第三方</SelectItem>
              <SelectItem value="openai">OpenAI 官方</SelectItem>
              <SelectItem value="compatible">OpenAI 兼容接口</SelectItem>
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
            placeholder="https://api.example.com"
            required
          />
          <p className="text-xs leading-5 text-muted-foreground">
            可填服务根地址，也可直接填 /v1/images/generations 完整地址。
          </p>
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>默认尺寸</Label>
          <Input name="size" defaultValue={config?.size ?? "1024x576"} />
        </div>
        <div className="space-y-2">
          <Label>质量参数</Label>
          <Input name="quality" defaultValue={config?.quality ?? "standard"} />
        </div>
        <div className="space-y-2">
          <Label>超时秒数</Label>
          <Input
            name="timeoutSeconds"
            type="number"
            min={10}
            max={300}
            defaultValue={config?.timeoutSeconds ?? 180}
          />
          <p className="text-xs leading-5 text-muted-foreground">
            单次生图默认等待 180 秒，慢模型可在这里调高，最高 300 秒。
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>封面 Prompt 模板</Label>
        <Textarea
          name="promptTemplate"
          className="min-h-56 font-mono text-xs leading-5"
          defaultValue={config?.promptTemplate ?? defaultCoverPromptTemplate}
          required
        />
        <p className="text-xs leading-5 text-muted-foreground">
          支持占位符：<code>{"{title}"}</code>、<code>{"{description}"}</code>、
          <code>{"{keywords}"}</code>、<code>{"{content}"}</code>。
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border/70 bg-background px-4 py-3">
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            启用配置
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            设为默认
          </label>
        </div>
        <Button type="submit" disabled={isSaving} className="min-w-28">
          {isSaving ? "保存中..." : config ? "保存配置" : "添加配置"}
        </Button>
      </div>
    </form>
  );
}

export function ImageGenerationConfigManager({
  configs,
}: {
  configs: Config[];
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(configs.length === 0);
  const [editId, setEditId] = useState<number | null>(null);

  async function handleDelete(id: number) {
    const config = configs.find((item) => item.id === id);
    if (!confirm(`确定删除生图配置「${config?.name ?? id}」吗？`)) return;

    try {
      await deleteImageGenerationConfigAction(id);
      notifySuccess({
        title: "生图配置已删除",
        description: describeAdminResult([config?.name, config?.model]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "生图配置删除失败",
        description: error instanceof Error ? error.message : "删除失败",
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ImagePlus className="size-4" />
          文章编辑页会调用默认启用配置生成封面图。
        </div>
        <Button
          type="button"
          variant={showCreate ? "secondary" : "default"}
          onClick={() => setShowCreate((value) => !value)}
        >
          <Plus className="size-4" />
          {showCreate ? "收起" : "新增配置"}
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

      <div className="overflow-hidden rounded-lg border border-border/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>服务</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>尺寸</TableHead>
              <TableHead>密钥</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-36 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {configs.map((config) => (
              <Fragment key={config.id}>
                <TableRow>
                  <TableCell className="font-medium">{config.name}</TableCell>
                  <TableCell>{config.provider}</TableCell>
                  <TableCell>{config.model}</TableCell>
                  <TableCell>{config.size}</TableCell>
                  <TableCell>
                    {config.hasApiKey ? config.apiKeyPreview : "未配置"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={config.enabled ? "default" : "secondary"}>
                        {config.enabled ? "启用" : "停用"}
                      </Badge>
                      {config.isDefault ? (
                        <Badge variant="outline">默认</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setEditId(editId === config.id ? null : config.id)
                        }
                      >
                        {editId === config.id ? "收起" : "编辑"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        onClick={() => handleDelete(config.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
                {editId === config.id ? (
                  <TableRow>
                    <TableCell colSpan={7}>
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
            ))}
            {configs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-28 text-center text-sm text-muted-foreground"
                >
                  暂无生图配置，添加并启用后才能在文章里生成封面图。
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
