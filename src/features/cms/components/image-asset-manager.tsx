"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  ExternalLink,
  FileSearch,
  RefreshCw,
  Replace,
  Save,
  Trash2,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

import {
  auditAndRepairImageAssetsAction,
  deleteImageAssetAction,
  convertUploadImagesToWebpAction,
  importUploadImagesAction,
  rebuildImageReferencesAction,
  rebuildResponsiveImageVariantsAction,
  replaceImageAssetFileAction,
  replaceImageReferencesAction,
  renameImageAssetFileAction,
  updateImageAssetMetadataAction,
} from "@/features/cms/actions/images";
import { AdminTableEmpty, AdminTableWorkbench } from "@/features/cms/components/admin-table-workbench";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { getOptimizedImageSrc } from "@fwqgo/core/image-src";

type ImageReference = {
  id: number;
  imageId: number;
  sourceType: string;
  sourceId: string;
  sourceLabel: string | null;
  field: string;
  createdAt: string;
  updatedAt: string | null;
};

export type ImageAssetWithReferences = {
  id: number;
  path: string;
  thumbPath: string | null;
  largePath: string | null;
  originalName: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  hash: string | null;
  imageType: string;
  status: string;
  altZh: string | null;
  altEn: string | null;
  sourceUrl: string | null;
  prompt: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string | null;
  references: ImageReference[];
};

type ImageMetadataDraft = {
  imageType: string;
  status: string;
  altZh: string;
  altEn: string;
};

export function ImageAssetManager({
  images,
  initialUsageFilter = "all",
}: {
  images: ImageAssetWithReferences[];
  initialUsageFilter?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [usageFilter, setUsageFilter] = useState(initialUsageFilter);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isPending, startTransition] = useTransition();
  const [replacementPathById, setReplacementPathById] = useState<Record<number, string>>({});
  const [fileNameById, setFileNameById] = useState<Record<number, string>>({});
  const [metadataById, setMetadataById] = useState<
    Record<number, ImageMetadataDraft>
  >({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const filteredImages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const counts = new Map<string, number>();
    for (const image of images) {
      if (!image.hash) continue;
      counts.set(image.hash, (counts.get(image.hash) ?? 0) + 1);
    }

    return images.filter((image) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        image.path.toLowerCase().includes(normalizedQuery) ||
        image.originalName.toLowerCase().includes(normalizedQuery) ||
        (image.altZh?.toLowerCase().includes(normalizedQuery) ?? false) ||
        (image.altEn?.toLowerCase().includes(normalizedQuery) ?? false) ||
        (image.prompt?.toLowerCase().includes(normalizedQuery) ?? false);

      const isUsed = image.references.length > 0;
      const qualityIssues = getImageQualityIssues(
        image,
        counts.get(image.hash ?? "") ?? 0,
      );
      const matchesUsage =
        usageFilter === "all" ||
        (usageFilter === "used" && isUsed) ||
        (usageFilter === "unused" && !isUsed) ||
        (usageFilter === "issues" && qualityIssues.length > 0) ||
        (usageFilter === "duplicates" &&
          Boolean(image.hash) &&
          (counts.get(image.hash ?? "") ?? 0) > 1) ||
        (usageFilter === "missing-alt" &&
          getMissingAltIssues(image).length > 0);
      const matchesType = typeFilter === "all" || image.imageType === typeFilter;
      const matchesStatus =
        statusFilter === "all" || image.status === statusFilter;

      return matchesQuery && matchesUsage && matchesType && matchesStatus;
    });
  }, [images, query, statusFilter, typeFilter, usageFilter]);
  const imageTypes = useMemo(
    () => [...new Set(images.map((image) => image.imageType))].sort(),
    [images],
  );
  const imageStatuses = useMemo(
    () => [...new Set(images.map((image) => image.status))].sort(),
    [images],
  );
  const qualitySummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const image of images) {
      if (!image.hash) continue;
      counts.set(image.hash, (counts.get(image.hash) ?? 0) + 1);
    }

    return images.reduce(
      (summary, image) => {
        const issues = getImageQualityIssues(
          image,
          counts.get(image.hash ?? "") ?? 0,
        );
        return {
          totalIssues: summary.totalIssues + issues.length,
          missingAlt: summary.missingAlt + getMissingAltIssues(image).length,
        };
      },
      { totalIssues: 0, missingAlt: 0 },
    );
  }, [images]);
  const duplicateHashCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const image of images) {
      if (!image.hash) continue;
      counts.set(image.hash, (counts.get(image.hash) ?? 0) + 1);
    }
    return counts;
  }, [images]);

  function runAction(action: () => Promise<void>) {
    startTransition(() => {
      void action();
    });
  }

  async function handleCopy(url: string) {
    await navigator.clipboard.writeText(url);
    toast.success("图片 URL 已复制");
  }

  async function handleImport() {
    const result = await importUploadImagesAction();
    if ("error" in result && typeof result.error === "string") {
      toast.error(result.error);
      return;
    }
    toast.success(
      `导入完成：新增 ${result.data.imported}，跳过 ${result.data.skipped}`,
    );
  }

  async function handleRebuildReferences() {
    const result = await rebuildImageReferencesAction();
    toast.success(`引用已重建：${result.data.references} 条`);
  }

  async function handleConvertToWebp() {
    try {
      const result = await convertUploadImagesToWebpAction();
      const failedCount = result.data.failed.length;
      if (failedCount > 0) {
        toast.warning(
          `历史图片转换完成：成功 ${result.data.converted}，跳过 ${result.data.skipped}，失败 ${failedCount}。首个失败：${result.data.failed[0]?.path} ${result.data.failed[0]?.error}`,
        );
        return;
      }

      toast.success(
        `历史图片转换完成：成功 ${result.data.converted}，跳过 ${result.data.skipped}，重建引用 ${result.data.references} 条`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "历史图片转换失败");
    }
  }

  async function handleRebuildResponsiveImages() {
    const result = await rebuildResponsiveImageVariantsAction();
    const failedCount = result.data.failed.length;
    if (failedCount > 0) {
      toast.warning(
        `响应式图片重建完成：成功 ${result.data.rebuilt}，跳过 ${result.data.skipped}，失败 ${failedCount}。首个失败：${result.data.failed[0]?.path} ${result.data.failed[0]?.error}`,
      );
      return;
    }

    toast.success(
      `响应式图片重建完成：成功 ${result.data.rebuilt}，跳过 ${result.data.skipped}`,
    );
  }

  async function handleAuditAndRepairImages() {
    const result = await auditAndRepairImageAssetsAction();
    const failedCount = result.data.failed.length;
    const message = `图片资产体检完成：扫描 ${result.data.scanned}，修复 ${result.data.repaired}，重建规格图 ${result.data.variantsRebuilt}，缺失文件 ${result.data.missing}，引用 ${result.data.references}`;

    if (failedCount > 0) {
      toast.warning(
        `${message}，失败 ${failedCount}。首个失败：${result.data.failed[0]?.path} ${result.data.failed[0]?.error}`,
      );
      return;
    }

    toast.success(message);
  }

  async function handleDelete(id: number) {
    const result = await deleteImageAssetAction(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("图片已删除");
  }

  async function handleReplaceFile(id: number, file: File | undefined) {
    if (!file) return;

    const formData = new FormData();
    formData.append("id", String(id));
    formData.append("file", file);

    const result = await replaceImageAssetFileAction(formData);
    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("图片文件已替换，原 URL 保持不变");
  }

  async function handleReplaceReferences(id: number) {
    const replacementPath = replacementPathById[id]?.trim();
    if (!replacementPath) {
      toast.error("请输入替换后的图片 URL");
      return;
    }

    const result = await replaceImageReferencesAction({
      imageId: id,
      replacementPath,
    });

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("引用已更新");
  }

  function getFileNameDraft(image: ImageAssetWithReferences) {
    return fileNameById[image.id] ?? image.path.split("/").pop() ?? image.originalName;
  }

  async function handleRenameFile(image: ImageAssetWithReferences) {
    const fileName = getFileNameDraft(image).trim();
    if (!fileName) {
      toast.error("请输入图片名称");
      return;
    }

    const currentFileName = image.path.split("/").pop() ?? image.originalName;
    if (fileName === currentFileName) {
      toast.info("图片名称没有变化");
      return;
    }

    const result = await renameImageAssetFileAction({
      id: image.id,
      fileName,
    });

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (!result.data) {
      toast.error("图片重命名失败：没有返回更新后的图片信息");
      return;
    }

    toast.success(`图片已重命名：${result.data.path}`);
    setFileNameById((prev) => {
      const next = { ...prev };
      delete next[image.id];
      return next;
    });
    router.refresh();
  }

  function getMetadataDraft(image: ImageAssetWithReferences) {
    return (
      metadataById[image.id] ?? {
        imageType: image.imageType,
        status: image.status,
        altZh: image.altZh ?? "",
        altEn: image.altEn ?? "",
      }
    );
  }

  function updateMetadataDraft(
    id: number,
    patch: Partial<ImageMetadataDraft>,
    image: ImageAssetWithReferences,
  ) {
    setMetadataById((prev) => ({
      ...prev,
      [id]: {
        ...getMetadataDraft(image),
        ...patch,
      },
    }));
  }

  async function handleUpdateMetadata(image: ImageAssetWithReferences) {
    const draft = getMetadataDraft(image);
    const result = await updateImageAssetMetadataAction({
      id: image.id,
      imageType: draft.imageType,
      status: draft.status,
      altZh: draft.altZh,
      altEn: draft.altEn,
    });

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("图片 SEO 信息已保存");
  }

  return (
    <div className="space-y-5">
      <AdminTableWorkbench
        title="图片资产库"
        description="支持搜索文件名、URL、alt 和 prompt，按引用、类型、状态筛选，并对未使用图片做清理。"
        searchValue={query}
        onSearchChange={setQuery}
        searchPlaceholder="搜索文件名、URL、alt 或 prompt"
        selectionCount={filteredImages.length}
        filterSlot={
          <div className="flex flex-wrap items-center gap-3">
            <Select value={usageFilter} onValueChange={setUsageFilter}>
              <SelectTrigger className="h-auto w-[132px] border-0 bg-transparent p-0 shadow-none focus:ring-0">
                <SelectValue placeholder="引用状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部图片</SelectItem>
                <SelectItem value="used">已使用</SelectItem>
                <SelectItem value="unused">未使用</SelectItem>
                <SelectItem value="issues">需优化</SelectItem>
                <SelectItem value="missing-alt">缺少 alt</SelectItem>
                <SelectItem value="duplicates">重复图片</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-auto w-[120px] border-0 bg-transparent p-0 shadow-none focus:ring-0">
                <SelectValue placeholder="图片类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {imageTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {imageTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-auto w-[104px] border-0 bg-transparent p-0 shadow-none focus:ring-0">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {imageStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {imageStatusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        actionSlot={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => runAction(handleImport)}
            >
              <UploadCloud className="size-4" />
              导入历史
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => runAction(handleRebuildReferences)}
            >
              <RefreshCw className="size-4" />
              重建引用
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => runAction(handleConvertToWebp)}
            >
              <WandSparkles className="size-4" />
              历史转 WebP
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => runAction(handleAuditAndRepairImages)}
            >
              <FileSearch className="size-4" />
              资产体检
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => runAction(handleRebuildResponsiveImages)}
            >
              <RefreshCw className="size-4" />
              重建响应式图
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">当前显示 {filteredImages.length} 张</Badge>
        <Badge variant={qualitySummary.totalIssues > 0 ? "secondary" : "outline"}>
          优化项 {qualitySummary.totalIssues}
        </Badge>
        <Badge variant={qualitySummary.missingAlt > 0 ? "secondary" : "outline"}>
          缺少 alt {qualitySummary.missingAlt}
        </Badge>
      </div>

      {filteredImages.length === 0 ? (
        <AdminTableEmpty
          title="没有匹配的图片"
          description="可以调整搜索条件，或先导入历史上传目录里的图片。"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[104px]">预览</TableHead>
              <TableHead>文件</TableHead>
              <TableHead>信息</TableHead>
              <TableHead>SEO / Alt</TableHead>
              <TableHead>引用</TableHead>
              <TableHead>替换引用</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredImages.map((image) => {
              const isUsed = image.references.length > 0;
              const qualityIssues = getImageQualityIssues(
                image,
                duplicateHashCounts.get(image.hash ?? "") ?? 0,
              );
              const metadataDraft = getMetadataDraft(image);

              return (
                <TableRow key={image.id}>
                  <TableCell>
                    <a href={image.path} target="_blank" rel="noopener noreferrer">
                      <div className="relative h-16 w-20 overflow-hidden rounded-md border border-border/70 bg-muted">
                        <Image
                          src={getOptimizedImageSrc(image.thumbPath ?? image.path)}
                          alt={image.originalName}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>
                    </a>
                  </TableCell>
                  <TableCell className="min-w-[260px]">
                    <div className="space-y-2">
                      <p className="line-clamp-1 font-medium text-foreground">
                        {image.originalName}
                      </p>
                      <button
                        type="button"
                        className="block max-w-[340px] truncate text-left text-xs text-muted-foreground hover:text-accent"
                        onClick={() => void handleCopy(image.path)}
                      >
                        {image.path}
                      </button>
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-9"
                          value={getFileNameDraft(image)}
                          placeholder="图片文件名.webp"
                          onChange={(event) =>
                            setFileNameById((prev) => ({
                              ...prev,
                              [image.id]: event.target.value,
                            }))
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => runAction(() => handleRenameFile(image))}
                        >
                          <Save className="size-4" />
                          改名
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={isUsed ? "default" : "secondary"}>
                          {isUsed ? "已使用" : "未使用"}
                        </Badge>
                        {qualityIssues.length > 0 ? (
                          <Badge variant="destructive">
                            {qualityIssues.length} 个优化项
                          </Badge>
                        ) : (
                          <Badge variant="outline">质量正常</Badge>
                        )}
                        {image.hash ? (
                          <Badge variant="outline">
                            hash {image.hash.slice(0, 8)}
                          </Badge>
                        ) : null}
                        <Badge variant="outline">
                          {imageTypeLabel(image.imageType)}
                        </Badge>
                        <Badge variant={image.status === "active" ? "outline" : "secondary"}>
                          {imageStatusLabel(image.status)}
                        </Badge>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div className="space-y-1">
                      <p>{image.mime}</p>
                      <p>{formatBytes(image.size)}</p>
                      <p>
                        {image.width && image.height
                          ? `${image.width} x ${image.height}`
                          : "尺寸未知"}
                      </p>
                      <p>
                        {image.thumbPath ? "缩略图已生成" : "缺少缩略图"}
                        {" · "}
                        {image.largePath ? "大图已生成" : "缺少大图"}
                      </p>
                      <p>{formatDate(image.createdAt)}</p>
                      {qualityIssues.length > 0 ? (
                        <div className="pt-1">
                          {qualityIssues.map((issue) => (
                            <p key={issue} className="text-xs text-amber-600">
                              {issue}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[280px]">
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Select
                          value={metadataDraft.imageType}
                          onValueChange={(value) =>
                            updateMetadataDraft(
                              image.id,
                              { imageType: value },
                              image,
                            )
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="图片类型" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="upload">上传图片</SelectItem>
                            <SelectItem value="ai_cover">AI 封面</SelectItem>
                            <SelectItem value="ai_generated">AI 生图</SelectItem>
                            <SelectItem value="provider">商家图片</SelectItem>
                            <SelectItem value="post_cover">文章封面</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select
                          value={metadataDraft.status}
                          onValueChange={(value) =>
                            updateMetadataDraft(image.id, { status: value }, image)
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="状态" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">启用</SelectItem>
                            <SelectItem value="archived">停用</SelectItem>
                            <SelectItem value="missing">文件缺失</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Input
                        className="h-9"
                        placeholder="中文 alt"
                        value={metadataDraft.altZh}
                        onChange={(event) =>
                          updateMetadataDraft(
                            image.id,
                            { altZh: event.target.value },
                            image,
                          )
                        }
                      />
                      <div className="flex items-center gap-2">
                        <Input
                          className="h-9"
                          placeholder="English alt"
                          value={metadataDraft.altEn}
                          onChange={(event) =>
                            updateMetadataDraft(
                              image.id,
                              { altEn: event.target.value },
                              image,
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() =>
                            runAction(() => handleUpdateMetadata(image))
                          }
                        >
                          <Save className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    {image.references.length === 0 ? (
                      <span className="text-sm text-muted-foreground">无引用</span>
                    ) : (
                      <div className="space-y-1">
                        {image.references.slice(0, 4).map((reference) => (
                          <p
                            key={reference.id}
                            className="line-clamp-1 text-sm text-muted-foreground"
                          >
                            {referenceLabel(reference)}
                          </p>
                        ))}
                        {image.references.length > 4 ? (
                          <p className="text-xs text-muted-foreground">
                            还有 {image.references.length - 4} 条
                          </p>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[260px]">
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-9"
                        placeholder="/uploads/new.webp"
                        value={replacementPathById[image.id] ?? ""}
                        onChange={(event) =>
                          setReplacementPathById((prev) => ({
                            ...prev,
                            [image.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          runAction(() => handleReplaceReferences(image.id))
                        }
                      >
                        <Replace className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="复制 URL"
                        onClick={() => void handleCopy(image.path)}
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button asChild variant="outline" size="icon" title="打开原图">
                        <a href={image.path} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="size-4" />
                        </a>
                      </Button>
                      <input
                        ref={(node) => {
                          fileInputRefs.current[image.id] = node;
                        }}
                        type="file"
                        accept="image/*"
                        hidden
                        onChange={(event) =>
                          runAction(() =>
                            handleReplaceFile(
                              image.id,
                              event.target.files?.[0] ?? undefined,
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        title="替换文件"
                        disabled={isPending}
                        onClick={() => fileInputRefs.current[image.id]?.click()}
                      >
                        <FileSearch className="size-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            disabled={isPending || isUsed}
                            title={isUsed ? "被引用时不能删除" : "删除图片"}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>删除这张图片？</AlertDialogTitle>
                            <AlertDialogDescription>
                              删除后会同时移除服务器文件。只有未被文章或用户引用的图片才能删除。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                runAction(() => handleDelete(image.id))
                              }
                            >
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function referenceLabel(reference: ImageReference) {
  const fieldMap: Record<string, string> = {
    cover: "封面",
    content: "正文",
    avatar: "头像",
  };

  const typeMap: Record<string, string> = {
    post: "文章",
    user: "用户",
  };

  return `${typeMap[reference.sourceType] ?? reference.sourceType} / ${
    fieldMap[reference.field] ?? reference.field
  } / ${reference.sourceLabel ?? reference.sourceId}`;
}

function imageTypeLabel(type: string) {
  const labels: Record<string, string> = {
    upload: "上传图片",
    ai_cover: "AI 封面",
    ai_generated: "AI 生图",
    provider: "商家图片",
    post_cover: "文章封面",
  };

  return labels[type] ?? type;
}

function imageStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "启用",
    archived: "停用",
  };

  return labels[status] ?? status;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getImageQualityIssues(
  image: ImageAssetWithReferences,
  duplicateHashCount: number,
) {
  const issues: string[] = [];

  if (image.size > 800 * 1024) {
    issues.push("体积偏大");
  }

  if (image.mime !== "image/webp" && image.mime !== "image/gif") {
    issues.push("建议转 WebP");
  }

  if (image.mime !== "image/gif" && (!image.thumbPath || !image.largePath)) {
    issues.push("缺少响应式图");
  }

  if (!image.width || !image.height) {
    issues.push("尺寸未知");
  } else if (image.width > 1800 || image.height > 1800) {
    issues.push("尺寸偏大");
  } else if (image.width < 320 || image.height < 180) {
    issues.push("尺寸偏小");
  } else if (
    ["ai_cover", "post_cover"].includes(image.imageType ?? "") &&
    (image.width < 960 || image.height < 420)
  ) {
    issues.push("封面尺寸偏小");
  } else if (["ai_cover", "post_cover"].includes(image.imageType ?? "")) {
    const ratio = image.width / image.height;
    if (ratio < 1.55 || ratio > 2.45) {
      issues.push("封面比例不适合文章首屏");
    }
  }

  if (duplicateHashCount > 1) {
    issues.push("疑似重复");
  }

  issues.push(...getMissingAltIssues(image));

  return issues;
}

function getMissingAltIssues(image: ImageAssetWithReferences) {
  const issues: string[] = [];

  if (image.status !== "active") {
    return issues;
  }

  if (!image.altZh?.trim()) {
    issues.push("缺少中文 alt");
  }

  if (!image.altEn?.trim()) {
    issues.push("缺少英文 alt");
  }

  return issues;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
