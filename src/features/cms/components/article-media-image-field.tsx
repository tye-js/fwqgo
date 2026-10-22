"use client";

import { ArticleCoverGenerator } from "@/features/cms/components/article-cover-generator";
import { CoverTaskPromptCopy } from "@/features/cms/components/cover-task-prompt-copy";

/**
 * 文章详情页的「媒体图」区块。
 *
 * 媒体图是给分享卡片用的那张 5:2 图：生成后由服务端插到标题与正文之间，
 * 同时作为 og:image 的第一候选。它**不占封面位**——文章已有封面时不会被覆盖，
 * 所以这里单独成块，和「封面图片」分开摆。
 *
 * 抽成独立组件还有一个硬原因：edit-post.tsx 已在客户端组件体积基线里冻结，
 * 只能变小不能变大（scripts/verify-client-component-size.ts）。
 */
export function ArticleMediaImageField({
  postId,
  title,
  description,
  fileSlug,
  language,
  currentCoverUrl,
  onGenerated,
  prompt,
  isPreview,
}: {
  postId?: number;
  title: string;
  description: string;
  fileSlug?: string | null;
  language?: "zh" | "en";
  currentCoverUrl: string;
  onGenerated: (url: string) => void;
  prompt: string | null;
  isPreview: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">媒体图（用于分享）</span>
        <ArticleCoverGenerator
          postId={postId}
          title={title}
          description={description}
          fileSlug={fileSlug}
          language={language}
          currentCoverUrl={currentCoverUrl}
          onGenerated={onGenerated}
        />
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        生成后自动插到标题与正文之间，并作为分享图（og:image）；已有封面不会被覆盖。
      </p>
      <CoverTaskPromptCopy prompt={prompt} isPreview={isPreview} compact />
    </div>
  );
}
