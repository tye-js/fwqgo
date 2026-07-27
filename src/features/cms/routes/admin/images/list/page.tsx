import { getImageAssetList, serializeImageAsset } from "@/server/images/assets";
import { requireAdminSession } from "@fwqgo/auth/session";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { ImageAssetManager } from "@/features/cms/components/image-asset-manager";
import { Button } from "@/components/ui/button";
import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { firstSearchParam, type SearchParamValue } from "@fwqgo/core/utils";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "未知错误";
}

async function loadImageAssets() {
  try {
    const data = await getImageAssetList();
    return { data, error: null };
  } catch (error) {
    console.error("图片管理页加载图片资产失败:", error);
    return { data: [], error: getErrorMessage(error) };
  }
}

export default async function ImageListPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: SearchParamValue;
    filter?: SearchParamValue;
    type?: SearchParamValue;
    status?: SearchParamValue;
  }>;
}) {
  await requireAdminSession();
  const params = await searchParams;
  const { data: images, error: loadError } = await loadImageAssets();
  const imageTypes = new Set(images.map((image) => image.imageType));
  const imageStatuses = new Set(images.map((image) => image.status));
  const query = firstSearchParam(params.query)?.trim() ?? "";
  const requestedUsageFilter = firstSearchParam(params.filter) ?? "";
  const requestedTypeFilter = firstSearchParam(params.type) ?? "";
  const requestedStatusFilter = firstSearchParam(params.status) ?? "";
  const usageFilter = [
    "all",
    "used",
    "unused",
    "issues",
    "missing-alt",
    "duplicates",
  ].includes(requestedUsageFilter)
    ? requestedUsageFilter
    : "all";
  const typeFilter = imageTypes.has(requestedTypeFilter)
    ? requestedTypeFilter
    : "all";
  const statusFilter = imageStatuses.has(requestedStatusFilter)
    ? requestedStatusFilter
    : "all";

  return (
    <AdminPageShell
      badge="图片资产"
      title="图片管理"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/images/upload">
            <ImagePlus className="size-4" />
            上传图片
          </Link>
        </Button>
      }
    >
      {loadError ? (
        <AdminSectionCard
          title="图片列表加载失败"
          description="无法读取图片资产列表。上传功能和文章封面字段不会被修改，请检查数据库连接、上传目录或后台日志。"
        >
          <p className="break-words text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : null}
      <ImageAssetManager
        images={images.map(serializeImageAsset)}
        initialQuery={query}
        initialUsageFilter={usageFilter}
        initialTypeFilter={typeFilter}
        initialStatusFilter={statusFilter}
      />
    </AdminPageShell>
  );
}
