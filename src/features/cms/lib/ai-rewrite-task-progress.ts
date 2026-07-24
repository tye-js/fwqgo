const aiRewriteStageErrorPattern =
  /来源事实提取|事实驱动正文改写|事实质量审查|正文改写质量审查|标题\/SEO 元信息生成|AI 元信息生成/;

export function isAiRewriteStageError(error: string | null | undefined) {
  return typeof error === "string" && aiRewriteStageErrorPattern.test(error);
}
