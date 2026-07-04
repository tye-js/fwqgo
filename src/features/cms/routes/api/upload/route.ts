import { isUnauthorizedError, requireAdminSession } from "@fwqgo/auth/session";
import { createImageAssetFromUpload } from "@/server/images/assets";
import { type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { adminApiFailure, adminApiSuccess } from "@/lib/admin-api-response";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminSession();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return adminApiFailure("没有选择上传文件", {
        status: 400,
        title: "上传图片失败",
        suggestion: "请选择一张图片后再上传。",
      });
    }

    const asset = await createImageAssetFromUpload({
      file,
      uploadedBy: session.userId,
    });

    revalidatePath("/images/list");
    revalidatePath("/images/upload");

    return adminApiSuccess({ url: asset.path, asset });
  } catch (error) {
    console.error("Upload error:", error);

    if (isUnauthorizedError(error)) {
      return adminApiFailure("请先登录后再上传图片", {
        status: 401,
        title: "登录已过期",
        suggestion: "请重新登录后台后再上传。",
      });
    }

    const message = error instanceof Error ? error.message : "Upload failed";
    const status = message.includes("too large")
      ? 413
      : message.includes("Invalid file type")
        ? 415
        : message.includes("Invalid upload path")
          ? 400
          : 500;

    return adminApiFailure(message, {
      status,
      title: "上传图片失败",
      suggestion: "请检查文件类型、大小和上传路径后再试。",
    });
  }
}
