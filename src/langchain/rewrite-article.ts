import {
  rewriteArticleWithAi,
  type ArticleRewriteOutput,
} from "@fwqgo/ai/article-rewriter";

export default async function RewriteArticle(
  content: string,
  options: { styleId?: number } = {},
): Promise<ArticleRewriteOutput> {
  return rewriteArticleWithAi(content, options);
}
