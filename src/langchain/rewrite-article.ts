import {
  rewriteArticleWithAi,
  type ArticleRewriteOptions,
  type ArticleRewriteOutput,
} from "@fwqgo/ai/article-rewriter";

export default async function RewriteArticle(
  content: string,
  options: ArticleRewriteOptions = {},
): Promise<ArticleRewriteOutput> {
  return rewriteArticleWithAi(content, options);
}
