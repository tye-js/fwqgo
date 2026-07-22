"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Trash2 } from "lucide-react";

import {
  addAffProvider,
  deleteAffProvider,
  deleteAffProviders,
  updateAffProvider,
} from "@/features/cms/actions/aff-provider";
import {
  AdminTableEmpty,
  AdminTableWorkbench,
} from "@/features/cms/components/admin-table-workbench";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  describeAdminResult,
  notifyError,
  notifyInfo,
  notifySuccess,
} from "@/lib/admin-toast";
import { type AffManData, type AffProviderTableData } from "@/types";
import { useUrlQueryUpdater } from "@/features/cms/hooks/use-url-query-updater";
import { ProviderProfileSheet } from "@/features/cms/components/provider-profile-sheet";
import { getAffiliateConfigState } from "@fwqgo/core/affiliate-provider";

type ActionErrorResult = {
  error: string;
  message?: string;
};

const ACTION_TIMEOUT_MS = 15_000;

function isActionError(result: unknown): result is ActionErrorResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "error" in result &&
    typeof (result as { error?: unknown }).error === "string"
  );
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizeOfficialUrl(value: string) {
  return normalizeText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function getProfileCompletion(provider: AffProviderTableData) {
  return [
    provider.summary,
    provider.refundPolicy,
    provider.prohibitedUses,
  ].filter(Boolean).length;
}

function getCollectionStatusLabel(provider: AffProviderTableData) {
  switch (provider.latestSnapshot?.status) {
    case "queued":
      return "等待采集";
    case "running":
      return "采集中";
    case "pending":
      return "待审核";
    case "failed":
      return "失败";
    case "applied":
      return "已应用";
    case "rejected":
      return "已驳回";
    default:
      return "未采集";
  }
}

function getCollectionStatusVariant(provider: AffProviderTableData) {
  switch (provider.latestSnapshot?.status) {
    case "pending":
      return "default" as const;
    case "failed":
      return "destructive" as const;
    case "queued":
    case "running":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function validateAffProviderForm(input: Omit<AffManData, "id">) {
  const normalizedInput = {
    name: normalizeText(input.name),
    affUrl: normalizeText(input.affUrl),
    affParam: normalizeText(input.affParam),
    affValue: normalizeText(input.affValue),
    officialUrl: normalizeOfficialUrl(input.officialUrl),
  };

  if (!normalizedInput.name || !normalizedInput.officialUrl) {
    return { error: "请填写商家名和官网域名", data: normalizedInput };
  }

  const affiliateConfigState = getAffiliateConfigState(normalizedInput);
  if (affiliateConfigState === "partial") {
    return {
      error: "返利链接、返利参数和返利值需全部填写，或全部留空",
      data: normalizedInput,
    };
  }

  if (affiliateConfigState === "complete") {
    try {
      const parsedUrl = new URL(normalizedInput.affUrl);

      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        return {
          error: "返利链接只支持 http 或 https",
          data: normalizedInput,
        };
      }
    } catch {
      return {
        error: "返利链接格式不正确，请填写完整 URL",
        data: normalizedInput,
      };
    }
  }

  if (
    normalizedInput.officialUrl.includes(" ") ||
    !normalizedInput.officialUrl.includes(".")
  ) {
    return {
      error: "商家官网请填写域名，例如 example.com",
      data: normalizedInput,
    };
  }

  return { data: normalizedInput };
}

function getAffiliateConfigSummary(input: Omit<AffManData, "id">) {
  return getAffiliateConfigState(input) === "complete"
    ? `${input.affParam}=${input.affValue}`
    : "未配置返利";
}

function withTimeout<T>(promise: Promise<T>, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(message));
    }, ACTION_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

export default function AffManTable({
  data,
  initialQuery,
  initialFilter = "all",
  initialSort = "id-desc",
}: {
  data: AffProviderTableData[];
  initialQuery: string;
  initialFilter?: string;
  initialSort?: string;
}) {
  const router = useRouter();
  const updateUrlQuery = useUrlQueryUpdater();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(initialFilter);
  const [sortValue, setSortValue] = useState(initialSort);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [affUrl, setAffUrl] = useState("");
  const [affParam, setAffParam] = useState("");
  const [affValue, setAffValue] = useState("");
  const [officialUrl, setOfficialUrl] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isSave, setIsSave] = useState(false);
  const [isAdd, setIsAdd] = useState(false);
  const [isAddSave, setIsAddSave] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [activeProviderId, setActiveProviderId] = useState<number | null>(null);

  function resetProviderForm() {
    setName("");
    setAffUrl("");
    setAffParam("");
    setAffValue("");
    setOfficialUrl("");
  }

  function openAddForm() {
    setEditId(null);
    resetProviderForm();
    setIsAdd(true);
  }

  function closeAddForm() {
    setIsAdd(false);
    resetProviderForm();
  }

  function openEditForm(provider: AffProviderTableData) {
    setIsAdd(false);
    setEditId(provider.id);
    setName(provider.name);
    setAffUrl(provider.affUrl);
    setAffParam(provider.affParam);
    setAffValue(provider.affValue);
    setOfficialUrl(provider.officialUrl);
  }

  function closeEditForm() {
    setEditId(null);
    resetProviderForm();
  }

  useEffect(() => {
    const normalizedInitialQuery = initialQuery.trim();
    const normalizedQuery = query.trim();

    if (normalizedQuery === normalizedInitialQuery) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      updateUrlQuery({ query: normalizedQuery || null });
    }, 400);

    return () => window.clearTimeout(timeoutId);
  }, [initialQuery, query, updateUrlQuery]);

  const sortedData = data;
  const activeProvider =
    data.find((provider) => provider.id === activeProviderId) ?? null;

  const allFilteredSelected =
    sortedData.length > 0 &&
    sortedData.every((item) => selectedIds.includes(item.id));

  async function handleSave() {
    if (!editId) {
      notifyError({
        title: "返利商家保存失败",
        description: "请先在表格中选择一个商家，再修改返利配置。",
      });
      return;
    }

    const validation = validateAffProviderForm({
      name,
      affUrl,
      affParam,
      affValue,
      officialUrl,
    });

    if (validation.error) {
      notifyError({
        title: "返利商家保存失败",
        description: describeAdminResult([
          validation.data.name,
          validation.error,
        ]),
      });
      return;
    }

    setIsSave(true);
    try {
      const result = await withTimeout(
        updateAffProvider({
          id: editId,
          ...validation.data,
        }),
        "保存超时，请稍后重试",
      );

      if (isActionError(result)) {
        notifyError({
          title: "返利商家保存失败",
          description: describeAdminResult([
            validation.data.name,
            validation.data.officialUrl,
            result.message ?? result.error,
          ]),
        });
        return;
      }

      closeEditForm();
      notifySuccess({
        title: "返利商家已更新",
        description: describeAdminResult([
          validation.data.name,
          validation.data.officialUrl,
          getAffiliateConfigSummary(validation.data),
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "返利商家保存失败",
        description:
          error instanceof Error ? error.message : "保存失败，请稍后重试",
      });
    } finally {
      setIsSave(false);
    }
  }

  async function handleDelete(id: number) {
    if (deletingId !== null) return;

    const provider = data.find((item) => item.id === id);
    setDeletingId(id);
    try {
      const result = await withTimeout(
        deleteAffProvider(id),
        "删除超时，请稍后重试",
      );

      if (isActionError(result)) {
        notifyError({
          title: "返利商家删除失败",
          description: describeAdminResult([
            provider?.name,
            provider?.officialUrl,
            result.message ?? result.error,
          ]),
        });
        return;
      }

      setSelectedIds((prev) => prev.filter((item) => item !== id));
      notifySuccess({
        title: "返利商家已删除",
        description: describeAdminResult([
          provider?.name,
          provider?.officialUrl,
          "后续链接替换不会再命中该商家",
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "返利商家删除失败",
        description:
          error instanceof Error ? error.message : "删除失败，请稍后重试",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      notifyError({
        title: "批量删除失败",
        description: "请先勾选需要删除的返利商家。",
      });
      return;
    }

    setIsBulkDeleting(true);
    try {
      const result = await withTimeout(
        deleteAffProviders(selectedIds),
        "批量删除超时，请稍后重试",
      );

      if (isActionError(result)) {
        notifyError({
          title: "批量删除返利商家失败",
          description: describeAdminResult([
            `已选择 ${selectedIds.length} 个商家`,
            result.message ?? result.error,
          ]),
        });
        return;
      }

      notifySuccess({
        title: "批量删除完成",
        description: describeAdminResult([
          `已删除 ${result.data} 个供应商`,
          "相关历史文章内容不会自动回滚",
        ]),
      });
      setSelectedIds([]);
      router.refresh();
    } catch (error) {
      notifyError({
        title: "批量删除返利商家失败",
        description:
          error instanceof Error ? error.message : "批量删除失败，请稍后重试",
      });
    } finally {
      setIsBulkDeleting(false);
    }
  }

  async function handleAdd() {
    const validation = validateAffProviderForm({
      name,
      affUrl,
      affParam,
      affValue,
      officialUrl,
    });

    if (validation.error) {
      notifyError({
        title: "返利商家添加失败",
        description: describeAdminResult([
          validation.data.name,
          validation.error,
        ]),
      });
      return;
    }

    const duplicatedProvider = data.find((item) => {
      return (
        item.name.trim() === validation.data.name ||
        normalizeOfficialUrl(item.officialUrl) === validation.data.officialUrl
      );
    });

    if (duplicatedProvider) {
      notifyInfo({
        title: "返利商家已存在",
        description: describeAdminResult([
          `${duplicatedProvider.name}（ID ${duplicatedProvider.id}）`,
          duplicatedProvider.officialUrl,
          "没有重复新增记录",
        ]),
      });
      return;
    }

    setIsAddSave(true);
    try {
      const result = await withTimeout(
        addAffProvider(validation.data),
        "添加超时，请检查网络或稍后重试",
      );

      if (isActionError(result)) {
        const message = result.message ?? result.error;

        if (result.error === "返利商家已存在") {
          notifyInfo({
            title: "返利商家已存在",
            description: message,
          });
        } else {
          notifyError({
            title: "返利商家添加失败",
            description: describeAdminResult([
              validation.data.name,
              validation.data.officialUrl,
              message,
            ]),
          });
        }
        return;
      }

      closeAddForm();
      notifySuccess({
        title: "返利商家已添加",
        description: describeAdminResult([
          validation.data.name,
          validation.data.officialUrl,
          getAffiliateConfigSummary(validation.data),
          validation.data.affUrl
            ? "采集和草稿编辑时可命中替换"
            : "已创建供应商档案",
        ]),
      });
      router.refresh();
    } catch (error) {
      notifyError({
        title: "返利商家添加失败",
        description:
          error instanceof Error ? error.message : "添加失败，请稍后重试",
      });
    } finally {
      setIsAddSave(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminTableWorkbench
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索商家名、官网域名或返利链接"
        selectionCount={selectedIds.length}
        filterSlot={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={filter}
              onValueChange={(value) => {
                setFilter(value);
                updateUrlQuery({ filter: value === "all" ? null : value });
              }}
            >
              <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[140px] sm:border-0 sm:bg-transparent sm:px-0">
                <SelectValue placeholder="全部商家" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部商家</SelectItem>
                <SelectItem value="with-aff">已配置返利</SelectItem>
                <SelectItem value="empty-aff">未配置返利</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortValue}
              onValueChange={(value) => {
                setSortValue(value);
                updateUrlQuery({ sort: value === "id-desc" ? null : value });
              }}
            >
              <SelectTrigger className="min-h-11 w-full border-border/70 bg-background shadow-none focus:ring-0 sm:w-[148px] sm:border-0 sm:bg-transparent sm:px-0">
                <SelectValue placeholder="排序方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id-desc">ID 从新到旧</SelectItem>
                <SelectItem value="id-asc">ID 从旧到新</SelectItem>
                <SelectItem value="name-asc">商家名 A-Z</SelectItem>
                <SelectItem value="officialUrl-asc">官网域名 A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        actionSlot={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={
                  selectedIds.length === 0 ||
                  isBulkDeleting ||
                  deletingId !== null
                }
                className="min-h-11 w-full sm:w-auto"
              >
                <Trash2 className="size-4" />
                {isBulkDeleting ? "删除中..." : "批量删除"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除选中的返利商家？</AlertDialogTitle>
                <AlertDialogDescription>
                  将永久删除 {selectedIds.length}{" "}
                  个供应商。存在采集监控或套餐关联时将拒绝删除；优惠码和档案采集快照会一并删除。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkDelete}>
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />

      <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3">
        <p className="text-sm font-medium text-foreground">添加商家</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          返利配置为可选；填写时，链接、参数和值必须同时完整。
        </p>
        {isAdd ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_140px_140px_1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="new-aff-provider-name">商家名</Label>
              <Input
                id="new-aff-provider-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如 RackNerd"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-aff-provider-url">返利链接（可选）</Label>
              <Input
                id="new-aff-provider-url"
                value={affUrl}
                onChange={(e) => setAffUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-aff-provider-param">返利参数（可选）</Label>
              <Input
                id="new-aff-provider-param"
                value={affParam}
                onChange={(e) => setAffParam(e.target.value)}
                placeholder="affid"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-aff-provider-value">返利值（可选）</Label>
              <Input
                id="new-aff-provider-value"
                value={affValue}
                onChange={(e) => setAffValue(e.target.value)}
                placeholder="123"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-aff-provider-domain">官网域名</Label>
              <Input
                id="new-aff-provider-domain"
                value={officialUrl}
                onChange={(e) => setOfficialUrl(e.target.value)}
                placeholder="example.com"
              />
            </div>
            <div className="flex flex-col gap-2 self-end sm:flex-row">
              <Button
                variant="secondary"
                onClick={closeAddForm}
                className="min-h-11"
              >
                取消
              </Button>
              <Button
                disabled={isAddSave}
                onClick={handleAdd}
                className="min-h-11"
              >
                {isAddSave ? "添加中..." : "添加"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <Button variant="outline" onClick={openAddForm}>
              添加新商家
            </Button>
          </div>
        )}
      </div>

      {sortedData.length === 0 ? (
        <AdminTableEmpty
          title="没有匹配的商家"
          description="试试更换关键词，或者切换筛选项看看。"
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border/70 bg-background">
          <Table className="min-w-[1280px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[44px]">
                  <Checkbox
                    aria-label="全选当前筛选商家"
                    checked={allFilteredSelected}
                    onCheckedChange={(checked) =>
                      setSelectedIds(
                        Boolean(checked)
                          ? sortedData.map((item) => item.id)
                          : [],
                      )
                    }
                  />
                </TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="text-nowrap">商家名</TableHead>
                <TableHead className="text-nowrap">返利链接</TableHead>
                <TableHead className="text-nowrap">返利参数</TableHead>
                <TableHead className="text-nowrap">返利值</TableHead>
                <TableHead>商家官网</TableHead>
                <TableHead className="text-nowrap">档案</TableHead>
                <TableHead className="text-nowrap">优惠码</TableHead>
                <TableHead className="text-nowrap">采集状态</TableHead>
                <TableHead className="text-center">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Checkbox
                      aria-label={`选择商家 ${item.name}`}
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={(checked) =>
                        setSelectedIds((prev) =>
                          Boolean(checked)
                            ? [...prev, item.id]
                            : prev.filter((id) => id !== item.id),
                        )
                      }
                    />
                  </TableCell>
                  {editId === item.id ? (
                    <>
                      <TableCell>{item.id}</TableCell>
                      <TableCell>
                        <Input
                          className="min-h-11 min-w-[140px]"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="min-h-11 min-w-[240px]"
                          value={affUrl}
                          onChange={(e) => setAffUrl(e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="min-h-11 min-w-[120px]"
                          value={affParam}
                          onChange={(e) => setAffParam(e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="min-h-11 min-w-[120px]"
                          value={affValue}
                          onChange={(e) => setAffValue(e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="min-h-11 min-w-[200px]"
                          value={officialUrl}
                          onChange={(e) => setOfficialUrl(e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            getProfileCompletion(item) === 3
                              ? "default"
                              : "outline"
                          }
                        >
                          {getProfileCompletion(item)}/3
                        </Badge>
                      </TableCell>
                      <TableCell>{item.promoCodes.length}</TableCell>
                      <TableCell>
                        <Badge variant={getCollectionStatusVariant(item)}>
                          {getCollectionStatusLabel(item)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={closeEditForm}
                          >
                            取消
                          </Button>
                          <Button
                            disabled={isSave}
                            size="sm"
                            onClick={handleSave}
                          >
                            {isSave ? "保存中..." : "保存"}
                          </Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{item.id}</TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <span
                          className={`block truncate ${item.affUrl ? "" : "text-muted-foreground"}`}
                        >
                          {item.affUrl || "未配置"}
                        </span>
                      </TableCell>
                      <TableCell>{item.affParam || "-"}</TableCell>
                      <TableCell>{item.affValue || "-"}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <span className="block truncate text-muted-foreground">
                          {item.officialUrl}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            getProfileCompletion(item) === 3
                              ? "default"
                              : "outline"
                          }
                        >
                          {getProfileCompletion(item)}/3
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {
                            item.promoCodes.filter((promo) => promo.active)
                              .length
                          }
                          <span className="text-muted-foreground">
                            /{item.promoCodes.length}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getCollectionStatusVariant(item)}>
                          {getCollectionStatusLabel(item)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveProviderId(item.id)}
                          >
                            <FileText className="size-4" />
                            档案
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditForm(item)}
                          >
                            <Pencil className="size-4" />
                            编辑
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={deletingId !== null}
                              >
                                <Trash2 className="size-4" />
                                删除
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  确定删除这个商家吗？
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  仅未关联采集监控或套餐的供应商可以删除。优惠码和档案采集快照会一并删除，当前供应商为
                                  <span className="mt-2 block text-red-500">
                                    {item.name}
                                  </span>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction
                                  disabled={deletingId === item.id}
                                  onClick={() => handleDelete(item.id)}
                                >
                                  {deletingId === item.id
                                    ? "删除中..."
                                    : "确定删除"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {activeProvider ? (
        <ProviderProfileSheet
          provider={activeProvider}
          open
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setActiveProviderId(null);
          }}
        />
      ) : null}
    </div>
  );
}
