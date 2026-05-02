interface TocItem {
  id: string;
  level: number;
  text: string;
}
// 添加一个生成唯一ID的辅助函数
export function generateUniqueId(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-") // 将空格替换为连字符
    .replace(/[^\u4e00-\u9fa5a-z0-9-]/g, "") // 只保留中文、小写字母、数字和连字符
    .replace(/-+/g, "-") // 将多个连字符替换为单个
    .replace(/^-|-$/g, ""); // 移除开头和结尾的连字符
}
// 为标题添加id
export function addIdsToHeadings(content: string): string {
  // 匹配所有h1-h6标签
  const headingRegex = /<h([2-6])(.*?)>(.*?)<\/h\1>/g;
  return content.replace(
    headingRegex,
    (match: string, level: string, attrs: string, text: string) => {
      const id: string = generateUniqueId(text);
      // 移除原有的id属性（如果存在）
      let newAttrs: string = attrs.replace(/\s*id="[^"]*"/, "");
      // 如果已有属性，在属性后添加id；如果没有属性，直接添加id
      newAttrs = attrs ? `${attrs} id="${id}"` : ` id="${id}"`;
      return `<h${level}${newAttrs}>${text}</h${level}>`;
    },
  );
}

export function generateToc(content: string): TocItem[] {
  // 使用正则匹配所有标题
  const headingRegex = /<h([2-6])[^>]*?id="([^"]+)"[^>]*>(.*?)<\/h\1>/g;
  const toc: TocItem[] = [];

  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const [, level, id, text] = match;
    toc.push({
      level: parseInt(level!),
      id: id ?? "",
      text: text ?? "", // 移除HTML标签
    });
  }

  return toc;
}
