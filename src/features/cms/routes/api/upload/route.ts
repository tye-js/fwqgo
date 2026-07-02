import { isUnauthorizedError, requireAdminSession } from "@fwqgo/auth/session";
import { createImageAssetFromUpload } from "@/server/images/assets";
import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminSession();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const asset = await createImageAssetFromUpload({
      file,
      uploadedBy: session.userId,
    });

    revalidatePath("/images/list");
    revalidatePath("/images/upload");

    return NextResponse.json({
      success: true,
      url: asset.path,
      asset,
    });
  } catch (error) {
    console.error("Upload error:", error);

    if (isUnauthorizedError(error)) {
      return NextResponse.json(
        { error: "请先登录后再上传图片" },
        { status: 401 },
      );
    }

    const message = error instanceof Error ? error.message : "Upload failed";
    const status = message.includes("too large")
      ? 413
      : message.includes("Invalid file type")
        ? 415
        : message.includes("Invalid upload path")
          ? 400
          : 500;

    return NextResponse.json(
      {
        error: message,
      },
      { status },
    );
  }
}
