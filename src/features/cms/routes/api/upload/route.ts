import { requireAdminSession } from "@/server/auth/session";
import { createImageAssetFromUpload } from "@/server/images/assets";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdminSession();

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const asset = await createImageAssetFromUpload({
      file,
      uploadedBy: session.userId,
    });

    return NextResponse.json({
      success: true,
      url: asset.path,
      asset,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed",
      },
      { status: 500 },
    );
  }
}
