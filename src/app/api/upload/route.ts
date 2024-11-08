import { NextResponse } from "next/server";
import { uploadImage } from "@/lib/upload";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "没有上传文件" }, { status: 400 });
    }

    // 转换文件为 Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // 上传图片
    const url = await uploadImage({
      file: buffer,
      filename: file.name,
    });

    return NextResponse.json({ url });
  } catch (error) {
    console.error("上传错误:", error);
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}
