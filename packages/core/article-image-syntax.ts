/**
 * 正文图片的 Markdown 语法：`![alt](url "图注")`。
 *
 * 单独成模块是为了让**编辑器和转换器共用同一处定义**：编辑器要插入图片语法，
 * 转换器（`packages/core/content.ts`）要把 HTML 还原成图片语法，两边一旦写法不一致
 * 就会产生「保存后再打开图注变了」这类静默漂移。
 *
 * 本模块不引入任何依赖，因此可以直接被客户端组件引用——`packages/core/content.ts`
 * 会连带 cheerio 与 marked 一起进包，编辑器的工具栏不能碰它。
 */

export function markdownEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

export function escapeMarkdownLinkDestination(href: string) {
  return href
    .trim()
    .replace(/\s/g, "%20")
    .replace(/\)/g, "%29")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E");
}

/**
 * 图注放在 Markdown 图片语法的 title 槽位。
 *
 * 只使用双引号形式：`markdownLinkPattern`（`content.ts` 与
 * `packages/ai/rewrite-quality.ts`）只识别双引号 title，单引号或括号形式会被当成
 * 链接文字，进而被 AI 改写的占位符机制拆坏。因此图注里的双引号归一成单引号，
 * 编辑器侧也同时禁止输入双引号，避免产生不可往返的内容。
 */
export function buildArticleImageMarkdown(input: {
  src: string;
  alt: string;
  caption: string;
}) {
  const caption = input.caption.replace(/"/g, "'").replace(/\s+/g, " ").trim();

  return `![${markdownEscape(input.alt)}](${escapeMarkdownLinkDestination(
    input.src,
  )}${caption ? ` "${caption}"` : ""})`;
}
