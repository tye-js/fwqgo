"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { ImageUpload } from "@/features/cms/components/image-upload";
import { ArticleCoverGenerator } from "@/features/cms/components/article-cover-generator";
import { GenerateEnglishArticleButton } from "@/features/cms/components/generate-english-article-button";
import { AffiliateRewriteAudit } from "@/features/cms/components/affiliate-rewrite-audit";
import { PostProductionContextPanel } from "@/features/cms/components/post-production-context-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Save,
  Tags,
  Wand2,
  X,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArticleTextInput } from "@/features/cms/components/article-text-input";
import { parseArticleTagInput } from "@/features/cms/lib/article-tag-input";
import { type PostEditFormData } from "@/types/post.types";
import { toast } from "sonner";
import { notifyActionError } from "@/lib/admin-toast";
import { rewriteDraftAffiliateLinksAction } from "@/features/cms/actions/affiliate-rewrite";
import { type AffiliateRewriteReport } from "@/server/links/affiliate-link-rewriter";
import { type NewTag } from "@/types";
import { Separator } from "@/components/ui/separator";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { type getPostProductionContext } from "@/features/cms/data/post";
import {
  ARTICLE_SLUG_ISSUE_MESSAGES,
  validateArticleSlug,
} from "@fwqgo/core/article-slug";
import { isRenderableImageSrc } from "@fwqgo/core/image-src";
import { PostInternalLinkManager } from "@/features/cms/components/post-internal-link-manager";
import type { AdminPostInternalLink } from "@/server/posts/internal-links";
import { useConfirmUnsavedChanges } from "@/features/cms/hooks/use-confirm-unsaved-changes";
interface Category {
  id: number;
  name: string;
}

type ProductionContext = NonNullable<
  Awaited<ReturnType<typeof getPostProductionContext>>
>;

export default function EditPost({
  post,
  categories,
  postMeta,
  productionContext,
  internalLinks,
}: {
  post: PostEditFormData;
  categories: Category[];
  postMeta: {
    title: string;
    slug: string;
    language: string;
    published: boolean;
    slugLocked?: boolean;
  };
  productionContext: ProductionContext | null;
  internalLinks: AdminPostInternalLink[];
}) {
  const router = useRouter();
  const postLanguage = postMeta.language === "en" ? "en" : "zh";
  const publicPostHref =
    postLanguage === "en"
      ? `/en/fwq/posts/${postMeta.slug}`
      : `/fwq/posts/${postMeta.slug}`;
  const [title, setTitle] = useState(postMeta.title);
  const [slug, setSlug] = useState(postMeta.slug);
  const [allowSlugChange, setAllowSlugChange] = useState(false);
  const slugIsLocked = Boolean(postMeta.published || postMeta.slugLocked);
  const [published, setPublished] = useState(postMeta.published);
  const [description, setDescription] = useState(post.post.description);
  const [content, setContent] = useState(post.post.content);
  const [imageUrl, setImageUrl] = useState(post.post.imgUrl ?? "");
  const [categoryId, setCategoryId] = useState(post.post.categoryId.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRewritingLinks, setIsRewritingLinks] = useState(false);
  const [affiliateReport, setAffiliateReport] =
    useState<AffiliateRewriteReport | null>(null);
  const [recommendTagName, setRecommendTagName] = useState<string>(
    post.post.recommendedTagName ?? "",
  );
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<NewTag[]>(post.tags);
  const [keywords, setKeywords] = useState<string>(
    limitKeywordInput(post.post.keywords ?? ""),
  );
  const articleFormDirty =
    title !== postMeta.title ||
    slug !== postMeta.slug ||
    published !== postMeta.published ||
    description !== post.post.description ||
    content !== post.post.content ||
    imageUrl !== (post.post.imgUrl ?? "") ||
    categoryId !== post.post.categoryId.toString() ||
    recommendTagName !== (post.post.recommendedTagName ?? "") ||
    keywords !== limitKeywordInput(post.post.keywords ?? "") ||
    tags.map((item) => item.tag.name).join("\u0000") !==
      post.tags.map((item) => item.tag.name).join("\u0000");

  useConfirmUnsavedChanges(
    articleFormDirty && !isSubmitting,
    "文章修改尚未保存，确定离开编辑页面吗？",
  );
  const handleAddTag = (tagInput: string) => {
    if (!tagInput.split(/[,，\n]/).some((name) => name.trim())) return;
    const names = parseArticleTagInput(
      tagInput,
      tags.map((tag) => tag.tag.name),
    );

    if (names.some((name) => name.length > 40)) {
      toast.error("标签名称不能超过 40 个字符");
      return;
    }

    if (
      postLanguage === "en" &&
      names.some((name) => /\p{Script=Han}/u.test(name))
    ) {
      toast.error("英文文章只能添加英文标签");
      return;
    }

    if (names.length === 0) {
      toast.info("这些标签已经添加过了");
      return;
    }

    setTags([...tags, ...names.map((name) => ({ tag: { name, slug: "" } }))]);
    setTagInput("");
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagName: string) => {
    if (!tags) return;
    setTags(tags.filter((tag) => tag.tag.name !== tagName));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    // 添加阻止事件冒泡
    e.stopPropagation();
    e.preventDefault();
    const normalizedContent = content.trim();
    const normalizedDescription = (description ?? "").trim();
    const normalizedImageUrl = imageUrl.trim();
    const normalizedTitle = title.trim();
    const normalizedSlug = slug.trim();
    const parsedCategoryId = Number(categoryId);

    if (!normalizedTitle) {
      toast.error("请填写文章标题");
      return;
    }
    if (normalizedTitle.length > 300) {
      toast.error("文章标题不能超过 300 个字符");
      return;
    }
    // 规则与后端共用一份（`@fwqgo/core/article-slug`）。
    // 原先这里写的是 360 字符、正则也只有 `[\s/?#]`：与后端的 320 上限、
    // 以及含反斜杠的字符集都不一致，操作者会遇到「前端通过、后端报错」。
    const slugIssue = validateArticleSlug(normalizedSlug);
    if (slugIssue) {
      toast.error(ARTICLE_SLUG_ISSUE_MESSAGES[slugIssue]);
      return;
    }
    if (!normalizedContent) {
      toast.error("请填写文章正文");
      return;
    }
    if (published && !normalizedDescription) {
      toast.error("发布前请填写文章简述");
      return;
    }
    if (!Number.isSafeInteger(parsedCategoryId) || parsedCategoryId <= 0) {
      toast.error("请选择正确的文章分类");
      return;
    }
    if (!categories.some((category) => category.id === parsedCategoryId)) {
      toast.error("当前分类不存在，请重新选择分类");
      return;
    }
    if (published && tags.length === 0) {
      toast.error("发布前请添加标签");
      return;
    }
    if (normalizedImageUrl && !isRenderableImageSrc(normalizedImageUrl)) {
      toast.error("封面地址格式不正确", {
        description: "请填写完整的 http(s) URL 或 /uploads/ 图片路径。",
      });
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/cms/posts/${post.post.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalizedTitle,
          slug: normalizedSlug,
          allowSlugChange,
          published,
          expectedUpdatedAt: post.post.updatedAt?.toISOString() ?? null,
          description: normalizedDescription,
          content: normalizedContent,
          imgUrl: normalizedImageUrl || null,
          categoryId: parsedCategoryId,
          recommendTagName: recommendTagName.trim(),
          keywords: limitKeywordInput(keywords),
          newTags: tags,
        }),
      });

      const result = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        message?: unknown;
        actionError?: {
          title: string;
          message: string;
          suggestion?: string;
        };
        data?: {
          saved?: boolean;
          slug?: string;
          published?: boolean;
          warnings?: string[];
        };
      } | null;
      if (!response.ok || result?.success === false || result?.error) {
        notifyActionError(
          result ?? {
            error:
              response.status === 401
                ? "登录已过期，请重新登录"
                : "更新文章失败，请重试",
          },
          { fallbackSuggestion: "请检查正文、摘要、分类、标签后再保存。" },
        );
        return;
      }

      const warnings = result?.data?.warnings?.filter(Boolean) ?? [];
      toast.success("更新文章成功", {
        description:
          warnings.length > 0 ? `注意：${warnings.join("；")}` : undefined,
      });
      const savedSlug = result?.data?.slug?.trim() ?? normalizedSlug;
      if (savedSlug !== postMeta.slug) {
        router.replace(`/posts/edit/post/${encodeURIComponent(savedSlug)}`);
      } else {
        router.refresh();
      }
    } catch (error) {
      console.error("更新文章失败:", error);
      toast.error(
        error instanceof Error ? error.message : "更新文章失败，请重试",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRewriteAffiliateLinks = async () => {
    if (!content.trim()) {
      toast.error("正文为空，无法替换返利链接");
      return;
    }

    setIsRewritingLinks(true);
    try {
      const result = await rewriteDraftAffiliateLinksAction(content);

      if ("error" in result) {
        toast.error(result.message ?? result.error);
        return;
      }

      setContent(result.data.content);
      setAffiliateReport(result.data.report);
      toast.success(
        `返利链接替换完成：命中 ${result.data.report.matchedLinks.length}，未命中 ${result.data.report.unmatchedLinks.length}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "返利链接替换失败");
    } finally {
      setIsRewritingLinks(false);
    }
  };

  const seoChecks = buildSeoChecks({
    content,
    description: description ?? "",
    keywords,
    tagCount: tags.length,
    recommendTagName,
  });
  const failedSeoChecks = seoChecks.filter((item) => !item.ok);

  return (
    <AdminPageShell
      badge="文章编辑"
      title="编辑文章"
      description="先完成正文，再检查封面、SEO 和发布设置。"
      actions={
        <>
          {postLanguage === "zh" ? (
            <GenerateEnglishArticleButton
              postId={post.post.id}
              hasUnsavedChanges={articleFormDirty || isSubmitting}
            />
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link href="/posts/edit">
              <ArrowLeft className="size-4" />
              返回列表
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={publicPostHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="size-4" />
              查看前台
            </Link>
          </Button>
        </>
      }
    >
      <form
        className="cms-editor-layout grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_350px] 2xl:grid-cols-[minmax(0,1fr)_380px]"
        onSubmit={handleSubmit}
      >
        <AdminSectionCard title="正文编辑" description={title}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label
                htmlFor="edit-post-content"
                className="text-sm font-medium"
              >
                文章内容
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="px-3"
                disabled={isRewritingLinks}
                onClick={handleRewriteAffiliateLinks}
              >
                <Wand2 className="size-4" />
                {isRewritingLinks ? "替换中..." : "替换返利链接"}
              </Button>
            </div>
            <MarkdownEditor
              id="edit-post-content"
              content={content}
              onChange={setContent}
              imageInsertLanguage={postLanguage}
            />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <FileText className="size-3.5" />
                正文字数
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {content.length}
              </p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Tags className="size-3.5" />
                当前标签
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {tags.length}
              </p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/15 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Save className="size-3.5" />
                SEO 通过
              </div>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {seoChecks.filter((item) => item.ok).length}/{seoChecks.length}
              </p>
            </div>
          </div>

          {affiliateReport ? (
            <div className="mt-3 space-y-3 rounded-md border border-border/70 bg-muted/15 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">本次替换审计</p>
                <Button asChild variant="outline" size="sm">
                  <Link href="/collect/aff-man">补返利规则</Link>
                </Button>
              </div>
              <AffiliateRewriteAudit report={affiliateReport} />
            </div>
          ) : null}
        </AdminSectionCard>

        <div className="space-y-5">
          <AdminSectionCard
            title="文章与发布设置"
            description="基础信息、分类、标签和摘要会影响前台展示与 SEO。"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="post-title">文章标题</Label>
                <ArticleTextInput
                  id="post-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={300}
                  required
                  className="min-h-11"
                  placeholder="输入文章标题"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="post-slug">文章 slug</Label>
                <ArticleTextInput
                  id="post-slug"
                  value={slug}
                  readOnly={slugIsLocked && !allowSlugChange}
                  onChange={(event) => setSlug(event.target.value)}
                  maxLength={320}
                  required
                  spellCheck={false}
                  className="min-h-11 font-mono"
                  placeholder="article-url-slug"
                />
                {slugIsLocked ? (
                  <div className="space-y-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => {
                        if (allowSlugChange) setSlug(postMeta.slug);
                        setAllowSlugChange(!allowSlugChange);
                      }}
                    >
                      {allowSlugChange ? "取消修改地址" : "修改已发布地址"}
                    </Button>
                    <p className="text-xs leading-5 text-muted-foreground">
                      文章地址默认锁定。修改后，旧地址会永久跳转到最新地址。
                    </p>
                  </div>
                ) : null}
                <p className="break-all text-xs leading-5 text-muted-foreground">
                  前台路径：
                  {postLanguage === "en" ? "/en/fwq/posts/" : "/fwq/posts/"}
                  {slug.trim() || "article-url-slug"}
                </p>
              </div>

              <div className="flex min-h-12 items-center justify-between gap-4 rounded-md border border-border/70 bg-muted/15 px-3 py-2">
                <div className="min-w-0">
                  <Label htmlFor="post-published">发布状态</Label>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {published
                      ? "保存时执行发布质检，通过后文章对外可见。"
                      : "文章保持在草稿箱，可继续修改后再发布。"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={published ? "default" : "secondary"}>
                    {published ? "已发布" : "草稿"}
                  </Badge>
                  <Switch
                    id="post-published"
                    checked={published}
                    onCheckedChange={setPublished}
                    aria-label="切换文章发布状态"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <label
                  htmlFor="edit-post-description"
                  className="text-sm font-medium"
                >
                  文章简述
                </label>
                <Textarea
                  id="edit-post-description"
                  value={description ?? ""}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="输入内容简述"
                  required
                  className="min-h-28 resize-y"
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">封面图片</span>
                  <ArticleCoverGenerator
                    postId={post.post.id}
                    title={title}
                    description={description ?? ""}
                    fileSlug={slug}
                    language={postLanguage}
                    currentCoverUrl={imageUrl}
                    onGenerated={setImageUrl}
                  />
                </div>
                <ImageUpload value={imageUrl} onChange={setImageUrl} />
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <label
                    htmlFor="edit-post-category"
                    className="text-sm font-medium"
                  >
                    分类
                  </label>
                  <Select
                    value={categoryId}
                    onValueChange={(value) => setCategoryId(value)}
                  >
                    <SelectTrigger
                      id="edit-post-category"
                      className="min-h-11 w-full"
                    >
                      <SelectValue placeholder="选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>文章分类</SelectLabel>
                        {categories.map((category) => (
                          <SelectItem
                            value={category.id.toString()}
                            key={category.id}
                          >
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="edit-post-recommended-tag"
                    className="text-sm font-medium"
                  >
                    推荐标签
                  </label>
                  <Input
                    id="edit-post-recommended-tag"
                    className="min-h-11"
                    value={recommendTagName}
                    onChange={(e) => setRecommendTagName(e.target.value)}
                    placeholder="用于详情页内链推荐"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium">标签</span>
                <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border border-border/70 bg-background p-2">
                  {tags.map((tag) => (
                    <Badge
                      key={tag.tag.name}
                      variant="secondary"
                      className="gap-1 rounded-md px-3"
                    >
                      {tag.tag.name}
                      <button
                        type="button"
                        aria-label={`移除标签 ${tag.tag.name}`}
                        className="ml-1 inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => handleRemoveTag(tag.tag.name)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </Badge>
                  ))}

                  {isAddingTag ? (
                    <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="多个标签用逗号分隔"
                        aria-label="新增文章标签"
                        className="min-w-0 flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            handleAddTag(tagInput);
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setIsAddingTag(false);
                          }
                        }}
                        autoFocus
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleAddTag(tagInput);
                        }}
                      >
                        添加
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="px-3"
                      onClick={() => setIsAddingTag(true)}
                    >
                      添加标签
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <label
                  htmlFor="edit-post-keywords"
                  className="text-nowrap text-sm font-medium"
                >
                  关键词
                </label>
                <p className="text-xs leading-5 text-muted-foreground">
                  关键词之间用逗号分隔，建议 2-6 个，单个关键词保持简短。
                </p>
                <Input
                  id="edit-post-keywords"
                  className="min-h-11 w-full"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  maxLength={800}
                  placeholder="香港服务器,独立服务器,CN2"
                />
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="SEO 检查"
            description="即时评估，不会阻止保存。"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">
                  当前完成度
                </p>
                <Badge
                  variant={
                    seoChecks.every((item) => item.ok) ? "default" : "secondary"
                  }
                >
                  {seoChecks.filter((item) => item.ok).length}/
                  {seoChecks.length}
                </Badge>
              </div>
              <div className="grid gap-2">
                {failedSeoChecks.length === 0 ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    SEO 检查已全部通过。
                  </div>
                ) : null}
                {failedSeoChecks.map((check) => (
                  <div
                    key={check.label}
                    className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">{check.label}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {check.note}
                      </p>
                    </div>
                    <Badge variant="destructive">需处理</Badge>
                  </div>
                ))}
              </div>
            </div>
          </AdminSectionCard>

          <div className="cms-mobile-save-bar rounded-xl border border-primary/20 bg-card/95 p-4 shadow-sm backdrop-blur lg:sticky lg:bottom-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                正文与文章设置一起保存。
              </p>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-h-11 min-w-32"
              >
                <Save className="size-4" />
                {isSubmitting ? "保存中..." : "保存修改"}
              </Button>
            </div>
          </div>
        </div>
      </form>
      <details className="cms-panel p-4 md:p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          文章来源、双语关系与内链管理
        </summary>
        <div className="mt-4 space-y-4">
          {productionContext ? (
            <PostProductionContextPanel context={productionContext} />
          ) : null}
          <AdminSectionCard title="文章内链">
            <PostInternalLinkManager
              postId={post.post.id}
              links={internalLinks}
            />
          </AdminSectionCard>
        </div>
      </details>
    </AdminPageShell>
  );
}

function limitKeywordInput(value: string) {
  return value
    .replace(/，/g, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(",");
}

function markdownToPlainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSeoChecks(input: {
  content: string;
  description: string;
  keywords: string;
  tagCount: number;
  recommendTagName: string;
}) {
  const plainText = markdownToPlainText(input.content);
  const keywordList = input.keywords
    .replace(/，/g, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return [
    {
      label: "描述长度",
      ok: input.description.length >= 80 && input.description.length <= 160,
      note: `当前 ${input.description.length} 字，建议 80-160 字。`,
    },
    {
      label: "关键词数量",
      ok: keywordList.length >= 2 && keywordList.length <= 6,
      note: `当前 ${keywordList.length} 个，建议 2-6 个。`,
    },
    {
      label: "正文完整性",
      ok: plainText.length >= 120,
      note: `当前 ${plainText.length} 字；正文应服从原文事实信息量，不再要求固定 800 字。`,
    },
    {
      label: "标签覆盖",
      ok: input.tagCount >= 2,
      note: `当前 ${input.tagCount} 个标签，建议至少 2 个。`,
    },
    {
      label: "推荐标签",
      ok: input.recommendTagName.trim().length > 0,
      note: input.recommendTagName.trim()
        ? "已配置推荐标签。"
        : "建议配置推荐标签以增强内链推荐。",
    },
    {
      label: "标题结构",
      ok: /^#{2,3}\s+\S+/m.test(input.content),
      note: /^#{2,3}\s+\S+/m.test(input.content)
        ? "正文包含小标题。"
        : "建议增加 H2/H3 小标题。",
    },
  ];
}
