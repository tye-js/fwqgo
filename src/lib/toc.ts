interface TocItem {
  id: string;
  level: number;
  text: string;
}

export function generateToc(content: string): TocItem[] {
  // 使用正则匹配所有标题
  const headingRegex = /<h([1-6]).*?id="(.*?)".*?>(.*?)<\/h\1>/g;
  const toc: TocItem[] = [];

  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    toc.push({
      level: parseInt(match[1]!),
      id: match[2]!,
      text: match[3]!.replace(/<[^>]*>/g, ""), // 移除HTML标签
    });
  }

  return toc;
}
