"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ExternalLink, Play, Plus, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  createAiSourceSiteAction,
  deleteAiSourceSiteAction,
  runAiSourceSiteAction,
  updateAiSourceSiteAction,
} from "@/features/cms/actions/ai-source-site";
import { type getAiSourceSiteList } from "@/features/cms/actions/ai-source-site";
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
  describeAdminResult,
  notifyError,
  notifyInfo,
  notifySuccess,
} from "@/lib/admin-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SourceSite = Awaited<ReturnType<typeof getAiSourceSiteList>>[number];

type Option = {
  id: number;
  name: string;
};

type RewriteStyleOption = {
  id: number;
  styleName: string;
  isDefault: boolean;
};

type LastRunResult = {
  siteId: number;
  runAt?: string;
  error?: string;
  discoveredCount: number;
  createdCount: number;
  skippedCount: number;
  discoveredUrls: string[];
  skippedUrls: string[];
  tasks: Array<{ id: number; sourceUrl: string }>;
};

function formatTime(value: Date | string | null) {
  if (!value) return "未执行";

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function inputNameFromForm(formData: FormData) {
  const name = formData.get("name");
  return typeof name === "string" ? name : null;
}

function inputLimitFromForm(formData: FormData) {
  const limit = formData.get("limit");
  return typeof limit === "string" ? limit : "-";
}

function parseLastRunDetails(
  siteId: number,
  value: string | null,
): LastRunResult | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const data = parsed as Partial<LastRunResult>;

    return {
      siteId,
      runAt: typeof data.runAt === "string" ? data.runAt : undefined,
      error: typeof data.error === "string" ? data.error : undefined,
      discoveredCount:
        typeof data.discoveredCount === "number" ? data.discoveredCount : 0,
      createdCount:
        typeof data.createdCount === "number" ? data.createdCount : 0,
      skippedCount:
        typeof data.skippedCount === "number" ? data.skippedCount : 0,
      discoveredUrls: Array.isArray(data.discoveredUrls)
        ? data.discoveredUrls.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      skippedUrls: Array.isArray(data.skippedUrls)
        ? data.skippedUrls.filter(
            (item): item is string => typeof item === "string",
          )
        : [],
      tasks: Array.isArray(data.tasks)
        ? data.tasks.filter((item): item is { id: number; sourceUrl: string } =>
            Boolean(
              item &&
              typeof item === "object" &&
              typeof (item as { id?: unknown }).id === "number" &&
              typeof (item as { sourceUrl?: unknown }).sourceUrl === "string",
            ),
          )
        : [],
    };
  } catch {
    return null;
  }
}

function SourceRunResultPanel({
  result,
  onClose,
}: {
  result: LastRunResult;
  onClose?: () => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">本次抓取结果</p>
          <p className="mt-1 text-xs text-muted-foreground">
            发现 {result.discoveredCount} · 新增 {result.createdCount} · 跳过{" "}
            {result.skippedCount}
            {result.runAt ? ` · ${formatTime(result.runAt)}` : ""}
          </p>
        </div>
        {onClose ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            收起
          </Button>
        ) : null}
      </div>
      {result.error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {result.error}
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            已加入任务
          </p>
          {result.tasks.length > 0 ? (
            result.tasks.map((task) => (
              <Link
                key={task.id}
                href={`/ai-tasks/${task.id}`}
                className="block rounded-md border border-border/70 px-3 py-2 text-xs hover:bg-muted/30"
              >
                <span className="line-clamp-1 break-all">
                  #{task.id} {task.sourceUrl}
                </span>
              </Link>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
              没有新任务
            </p>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            重复或超出数量跳过
          </p>
          {result.skippedUrls.length > 0 ? (
            result.skippedUrls.slice(0, 12).map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border border-border/70 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30"
              >
                <span className="line-clamp-1 break-all">{url}</span>
              </a>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
              没有跳过 URL
            </p>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            发现的最新 URL
          </p>
          {result.discoveredUrls.length > 0 ? (
            result.discoveredUrls.slice(0, 12).map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-md border border-border/70 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30"
              >
                <span className="line-clamp-1 break-all">{url}</span>
              </a>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
              没有发现 URL
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceSiteForm({
  site,
  categories,
  rewriteStyles,
  onDone,
}: {
  site?: SourceSite;
  categories: Option[];
  rewriteStyles: RewriteStyleOption[];
  onDone?: () => void;
}) {
  const [enabled, setEnabled] = useState(site?.enabled ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const defaultCategoryId = site?.categoryId ?? categories[0]?.id;
  const defaultRewriteStyleId = site?.rewriteStyleId
    ? String(site.rewriteStyleId)
    : "__default";

  async function handleSubmit(formData: FormData) {
    setIsSaving(true);
    formData.set("enabled", enabled ? "true" : "false");

    if (formData.get("rewriteStyleId") === "__default") {
      formData.delete("rewriteStyleId");
    }

    try {
      const result = site
        ? await updateAiSourceSiteAction(site.id, formData)
        : await createAiSourceSiteAction(formData);

      if (result.error) {
        notifyError({
          title: site ? "来源站更新失败" : "来源站添加失败",
          description: describeAdminResult([
            inputNameFromForm(formData),
            result.error,
            "请检查站点 URL、Feed URL、分类和改写风格配置",
          ]),
        });
        return;
      }

      notifySuccess({
        title: site ? "来源站配置已更新" : "来源站配置已添加",
        description: describeAdminResult([
          inputNameFromForm(formData),
          `每次抓取 ${inputLimitFromForm(formData)} 条`,
          "保存后可点击抓取新页面创建 AI 改写任务",
        ]),
      });
      onDone?.();
    } catch (error) {
      notifyError({
        title: site ? "来源站更新失败" : "来源站添加失败",
        description: describeAdminResult([
          inputNameFromForm(formData),
          error instanceof Error ? error.message : "保存失败",
          "请检查站点 URL、Feed URL、分类和改写风格配置",
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
      <div className="grid gap-4 lg:grid-cols-[minmax(180px,0.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label>站点名称</Label>
          <Input
            name="name"
            defaultValue={site?.name ?? "主机测评中文站"}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>站点 URL</Label>
          <Input
            name="siteUrl"
            type="url"
            defaultValue={site?.siteUrl ?? "https://www.zhujiceping.com/"}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Feed / Sitemap URL</Label>
          <Input
            name="feedUrl"
            type="url"
            defaultValue={site?.feedUrl ?? ""}
            placeholder="留空自动尝试 sitemap 和 feed"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(180px,0.4fr)_minmax(180px,0.4fr)_120px_auto]">
        <div className="space-y-2">
          <Label>默认分类</Label>
          <Select
            name="categoryId"
            defaultValue={
              defaultCategoryId ? String(defaultCategoryId) : undefined
            }
            required
          >
            <SelectTrigger>
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>改写风格</Label>
          <Select name="rewriteStyleId" defaultValue={defaultRewriteStyleId}>
            <SelectTrigger>
              <SelectValue placeholder="使用默认改写风格" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__default">使用默认改写风格</SelectItem>
              {rewriteStyles.map((style) => (
                <SelectItem key={style.id} value={String(style.id)}>
                  {style.styleName}
                  {style.isDefault ? "（默认）" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>单次数量</Label>
          <Input
            name="limit"
            type="number"
            min={1}
            max={50}
            defaultValue={site?.limit ?? 10}
            required
          />
        </div>
        <div className="flex items-end justify-between gap-4">
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            启用
          </label>
          <Button type="submit" disabled={isSaving || categories.length === 0}>
            <Settings2 className="size-4" />
            {isSaving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </form>
  );
}

export function AiSourceSiteManager({
  sites,
  categories,
  rewriteStyles,
}: {
  sites: SourceSite[];
  categories: Option[];
  rewriteStyles: RewriteStyleOption[];
}) {
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(sites.length === 0);
  const [editId, setEditId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [lastRunResult, setLastRunResult] = useState<LastRunResult | null>(
    null,
  );

  async function handleRun(id: number) {
    const site = sites.find((item) => item.id === id);
    setRunningId(id);
    try {
      const result = await runAiSourceSiteAction(id);

      if (result.error) {
        notifyError({
          title: "来源站抓取失败",
          description: describeAdminResult([
            site?.name,
            result.error,
            "没有创建新的 AI 改写任务",
          ]),
        });
        return;
      }

      if (!result.data) {
        notifyError({
          title: "来源站抓取失败",
          description: describeAdminResult([
            site?.name,
            "服务端没有返回抓取统计",
            "请稍后重试或检查服务器日志",
          ]),
        });
        return;
      }

      if ("queued" in result.data && result.data.queued) {
        notifyInfo({
          title: "来源站抓取已进入后台",
          description: describeAdminResult([
            site?.name,
            "系统会后台发现新链接并创建 AI 改写任务",
            "稍后刷新可查看最近一次抓取结果",
          ]),
        });
        router.refresh();
        return;
      }

      notifySuccess({
        title:
          result.data.createdCount > 0
            ? "来源站抓取完成，已创建改写任务"
            : "来源站抓取完成，没有新的文章",
        description: describeAdminResult([
          site?.name,
          `发现 ${result.data.discoveredCount} 条`,
          `新增 ${result.data.createdCount} 个任务`,
          `跳过 ${result.data.skippedCount} 条重复或超额链接`,
        ]),
      });
      setLastRunResult({ siteId: id, ...result.data });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "来源站抓取失败",
        description: describeAdminResult([
          site?.name,
          error instanceof Error ? error.message : "抓取任务执行失败",
          "没有创建新的 AI 改写任务",
        ]),
      });
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(id: number) {
    try {
      const result = await deleteAiSourceSiteAction(id);

      if (result.error) {
        notifyError({
          title: "来源站删除失败",
          description: describeAdminResult([
            sites.find((site) => site.id === id)?.name,
            result.error,
          ]),
        });
        return;
      }

      notifySuccess({
        title: "来源站配置已删除",
        description: describeAdminResult([
          sites.find((site) => site.id === id)?.name,
          "后续不会再从该站点创建批量抓取任务",
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "来源站删除失败",
        description: describeAdminResult([
          sites.find((site) => site.id === id)?.name,
          error instanceof Error ? error.message : "删除失败",
        ]),
      });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowCreate((value) => !value)}
        >
          <Plus className="size-4" />
          添加来源站
        </Button>
      </div>

      {showCreate ? (
        <SourceSiteForm
          categories={categories}
          rewriteStyles={rewriteStyles}
          onDone={() => {
            setShowCreate(false);
            router.refresh();
          }}
        />
      ) : null}

      {lastRunResult ? (
        <SourceRunResultPanel
          result={lastRunResult}
          onClose={() => setLastRunResult(null)}
        />
      ) : null}

      <div className="rounded-lg border border-border/70 bg-background shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>来源站</TableHead>
              <TableHead>配置</TableHead>
              <TableHead>最近执行</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sites.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  暂无来源站配置
                </TableCell>
              </TableRow>
            ) : (
              sites.map((site) => (
                <Fragment key={site.id}>
                  <TableRow>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{site.name}</p>
                        <a
                          href={site.siteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 break-all text-sm text-muted-foreground hover:text-foreground"
                        >
                          {site.siteUrl}
                          <ExternalLink className="size-3.5" />
                        </a>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-sm">
                        <p>{site.categoryName ?? "-"}</p>
                        <p className="text-muted-foreground">
                          {site.rewriteStyleName ?? "默认改写风格"} · 每次{" "}
                          {site.limit} 条
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div className="space-y-1">
                        <p>{formatTime(site.lastRunAt)}</p>
                        <p>
                          发现 {site.lastDiscoveredCount} · 新增{" "}
                          {site.lastCreatedCount} · 跳过 {site.lastSkippedCount}
                        </p>
                        {site.lastError ? (
                          <p className="text-destructive">{site.lastError}</p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={site.enabled ? "default" : "secondary"}>
                        {site.enabled ? "启用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={!site.enabled || runningId === site.id}
                          onClick={() => void handleRun(site.id)}
                        >
                          <Play className="size-4" />
                          {runningId === site.id ? "抓取中" : "抓取新页面"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setDetailId((value) =>
                              value === site.id ? null : site.id,
                            )
                          }
                        >
                          查看结果
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setEditId((value) =>
                              value === site.id ? null : site.id,
                            )
                          }
                        >
                          配置
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          aria-label={`删除来源站：${site.name}`}
                          title={`删除来源站：${site.name}`}
                          onClick={() => void handleDelete(site.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {detailId === site.id
                    ? (() => {
                        const details = parseLastRunDetails(
                          site.id,
                          site.lastRunDetails,
                        );

                        return (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/20">
                              {details ? (
                                <SourceRunResultPanel result={details} />
                              ) : (
                                <p className="rounded-md border border-dashed border-border/70 bg-background px-4 py-6 text-center text-sm text-muted-foreground">
                                  暂无最近一次抓取明细，点击“抓取新页面”后会保存。
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })()
                    : null}
                  {editId === site.id ? (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/20">
                        <SourceSiteForm
                          site={site}
                          categories={categories}
                          rewriteStyles={rewriteStyles}
                          onDone={() => {
                            setEditId(null);
                            router.refresh();
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
