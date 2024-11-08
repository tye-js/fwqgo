import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

interface UploadImageProps {
  file: Buffer;
  filename: string;
}

export async function uploadImage({ file, filename }: UploadImageProps) {
  try {
    // 生成唯一文件名
    const uniqueSuffix = crypto.randomBytes(8).toString("hex");
    const extension = path.extname(filename);
    const newFilename = `${path.basename(filename, extension)}-${uniqueSuffix}${extension}`;

    // 按年月创建目录
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const uploadDir = path.join(
      process.cwd(),
      "public",
      "img",
      "uploads",
      "posts",
      String(year),
      month,
    );

    // 确保目录存在
    await mkdir(uploadDir, { recursive: true });

    // 保存文件
    const filePath = path.join(uploadDir, newFilename);
    await writeFile(filePath, file);

    // 返回相对路径
    return `/img/uploads/posts/${year}/${month}/${newFilename}`;
  } catch (error) {
    console.error("图片上传失败:", error);
    throw new Error("图片上传失败");
  }
}
