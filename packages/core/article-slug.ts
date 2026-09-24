/**
 * 文章 slug 的校验规则：**入库校验与后台表单的提前提示共用这一份**。
 *
 * 分成多份写必然漂移。实测（2026-09-25）：同一条规则当时散在三个地方——
 * `src/server/posts/create-post-record.ts` 与 `src/features/cms/lib/post-edit.ts` 的 zod
 * schema 都是 `/[\s/?#\\\u0000-\u001f\u007f]/`，而编辑页的**前端**校验只写了
 * `/[\s/?#]/`：操作者填入反斜杠时前端放行，提交到后端才报错。
 *
 * 后端仍是最终裁决者；前端用它只是为了把错误提前说出来。
 */

/** slug 长度上限，与 `posts.slug` 的实际约束一致。 */
export const ARTICLE_SLUG_MAX_LENGTH = 320;

/**
 * 不允许出现在 slug 里的字符：空白、路径分隔符、查询/锚点起始符、反斜杠，以及控制字符。
 *
 * 它们会直接破坏前台路由 `/fwq/posts/<slug>`：空白与 `/` 会切出额外的路径段，
 * `?` 与 `#` 会截断路径，`\` 在不同代理/编码层下会被解释成路径分隔符。
 */
const ARTICLE_SLUG_INVALID_PATTERN = /[\s/?#\\\u0000-\u001f\u007f]/;

/**
 * 只判断非法字符，不含长度与非空。
 *
 * 给 zod 这类已经用 `.min()`/`.max()` 单独管长度与非空的调用方用——
 * 在那里再用 `validateArticleSlug` 会同时命中两条消息。
 */
export function hasInvalidArticleSlugCharacters(value: string) {
  return ARTICLE_SLUG_INVALID_PATTERN.test(value);
}

export type ArticleSlugIssue = "empty" | "too-long" | "invalid-characters";

/**
 * 校验一个待用的 slug。返回 `null` 表示可用。
 *
 * 注意 `"empty"` 是**合法**的输入而不是错误：创建文章时留空表示「按标题自动生成」，
 * 是否放行由调用方按场景决定。编辑场景要求必填，所以必须自己拦下 `"empty"`。
 */
export function validateArticleSlug(value: string): ArticleSlugIssue | null {
  const normalized = value.trim();

  if (!normalized) return "empty";
  if (normalized.length > ARTICLE_SLUG_MAX_LENGTH) return "too-long";
  if (hasInvalidArticleSlugCharacters(normalized)) return "invalid-characters";

  return null;
}

/** issue → 面向操作者的中文提示。前后端共用，避免同一件事有两种说法。 */
export const ARTICLE_SLUG_ISSUE_MESSAGES: Record<ArticleSlugIssue, string> = {
  empty: "文章 slug 不能为空",
  "too-long": `文章 slug 不能超过 ${ARTICLE_SLUG_MAX_LENGTH} 个字符`,
  "invalid-characters":
    "文章 slug 不能包含空格、斜杠、问号、井号或反斜杠",
};
