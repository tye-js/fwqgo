"use server";

import { db } from "@/server/db";
import { z } from "zod";

// 定义输入验证 schema
const createTagSchema = z.object({
  name: z
    .string()
    .min(2, "标签名称至少需要2个字符")
    .max(20, "标签名称不能超过20个字符")
    .trim(),
});

// 创建新文章时添加的标签，如果标签已经存在，则返回已存在的标签，否则创建新标签
export async function createTag(input: z.infer<typeof createTagSchema>) {
  // 验证输入
  const result = createTagSchema.parse(input);

  const existingTag = await db.tag.findFirst({ where: { name: input.name } });
  if (existingTag) return existingTag;

  // 生成 slug
  const slug = input.name.toLowerCase().replace(/\s+/g, "-");

  return await db.tag.create({ data: { name: result.name, slug } });
}
