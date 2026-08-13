"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Plus, Star, Trash2 } from "lucide-react";

import {
  createImageGenerationConfigAction,
  deleteImageGenerationConfigAction,
  setDefaultImageGenerationConfigAction,
  setImageGenerationConfigEnabledAction,
  updateImageGenerationConfigAction,
} from "@/features/cms/actions/image-generation-config";
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
  defaultCoverPromptTemplate,
  defaultEnglishCoverPromptTemplate,
} from "@fwqgo/core/image-generation-prompts";
import {
  describeAdminResult,
  notifyError,
  notifySuccess,
} from "@/lib/admin-toast";
import { unwrapAdminActionResult } from "@/lib/admin-action-result";

type Config = {
  id: number;
  name: string;
  provider: "openai" | "image2" | "compatible";
  baseUrl: string;
  model: string;
  promptTemplate: string;
  englishPromptTemplate: string | null;
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
        const result = unwrapAdminActionResult(
          await updateImageGenerationConfigAction(config.id, formData),
        );
        notifySuccess({
          title: "生图配置已更新",
          description: describeAdminResult([
            stringValue(formData, "name"),
            stringValue(formData, "model"),
            enabled ? "已启用" : "已停用",
            isDefault ? "默认配置" : null,
            result.reboundFailedTaskCount > 0
              ? `${result.reboundFailedTaskCount} 个失败任务已切换到最新默认配置`
              : null,
          ]),
        });
      } else {
        const result = unwrapAdminActionResult(
          await createImageGenerationConfigAction(formData),
        );
        notifySuccess({
          title: "生图配置已添加",
          description: describeAdminResult([
            stringValue(formData, "name"),
            stringValue(formData, "model"),
            "可在文章编辑页生成封面图",
            result.reboundFailedTaskCount > 0
              ? `${result.reboundFailedTaskCount} 个失败任务已切换到最新默认配置`
              : null,
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
            可填服务根地址，也可直接填 /v1/images/generations
            完整地址。若服务商区分文本和图片主机，必须填写图片专用地址。
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
        <Label>中文封面 Prompt 模板</Label>
        <Textarea
          name="promptTemplate"
          className="min-h-56 font-mono text-xs leading-5"
          defaultValue={config?.promptTemplate ?? defaultCoverPromptTemplate}
          required
        />
        <p className="text-xs leading-5 text-muted-foreground">
          仅用于中文文章封面。支持占位符：
          <code>{"{title}"}</code>、<code>{"{description}"}</code>、
          <code>{"{keywords}"}</code>、<code>{"{visualBrief}"}</code>。正文不会直接注入 Prompt，系统会自动追加中文语言约束和旗帜限制。
        </p>
      </div>

      <div className="space-y-2">
        <Label>英文封面 Prompt 模板</Label>
        <Textarea
          name="englishPromptTemplate"
          className="min-h-72 font-mono text-xs leading-5"
          defaultValue={
            config?.englishPromptTemplate ?? defaultEnglishCoverPromptTemplate
          }
          required
        />
        <p className="text-xs leading-5 text-muted-foreground">
          仅用于英文文章封面，不会拼接中文封面模板。支持占位符：
          <code>{"{title}"}</code>、<code>{"{description}"}</code>、
          <code>{"{keywords}"}</code>、<code>{"{visualBrief}"}</code>。
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-border/70 bg-background px-4 py-3">
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={enabled}
              onCheckedChange={(checked) => {
                setEnabled(checked);
                if (!checked) setIsDefault(false);
              }}
            />
            启用配置
          </label>
          <label className="flex items-center gap-3 text-sm">
            <Switch
              checked={isDefault}
              onCheckedChange={(checked) => {
                setIsDefault(checked);
                if (checked) setEnabled(true);
              }}
            />
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
  const [pendingAction, setPendingAction] = useState<{
    id: number;
    type: "enabled" | "default";
  } | null>(null);

  async function handleEnabledChange(id: number, enabled: boolean) {
    const config = configs.find((item) => item.id === id);
    setPendingAction({ id, type: "enabled" });

    try {
      const result = unwrapAdminActionResult(
        await setImageGenerationConfigEnabledAction(id, enabled),
      );
      notifySuccess({
        title: enabled ? "生图配置已启用" : "生图配置已停用",
        description: describeAdminResult([
          config?.name,
          !enabled && config?.isDefault
            ? "默认状态已同步更新；如有其他启用配置，系统会自动设为默认"
            : null,
          result.reboundFailedTaskCount > 0
            ? `${result.reboundFailedTaskCount} 个失败任务已切换到新的默认配置`
            : null,
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "生图配置状态更新失败",
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
      const result = unwrapAdminActionResult(
        await setDefaultImageGenerationConfigAction(id),
      );
      notifySuccess({
        title: "默认生图配置已更新",
        description: describeAdminResult([
          config?.name,
          config?.enabled ? null : "配置已同时启用",
          result.reboundFailedTaskCount > 0
            ? `${result.reboundFailedTaskCount} 个失败任务已切换到新的默认配置`
            : null,
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "默认生图配置更新失败",
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
      const result = unwrapAdminActionResult(
        await deleteImageGenerationConfigAction(id),
      );
      notifySuccess({
        title: "生图配置已删除",
        description: describeAdminResult([
          config?.name,
          config?.model,
          result.reboundFailedTaskCount > 0
            ? `${result.reboundFailedTaskCount} 个失败任务已切换到新的默认配置`
            : null,
        ]),
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

      <div className="overflow-x-auto rounded-md border border-border/70">
        <Table className="min-w-[860px]">
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
                  <TableCell className="min-w-64">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex h-11 items-center gap-2 text-sm">
                        <Switch
                          checked={config.enabled}
                          disabled={pendingAction !== null}
                          aria-label={`${config.enabled ? "停用" : "启用"}生图配置：${config.name}`}
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
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            aria-label={`删除生图配置：${config.name}`}
                            title={`删除生图配置：${config.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              删除这套生图配置？
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后自动封面生成不会再使用这套配置，当前配置为
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
