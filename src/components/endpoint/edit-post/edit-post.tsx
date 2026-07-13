"use client";
import { useState } from "react";
import Link from "next/link";

import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { ImageUpload } from "@/features/cms/components/image-upload";
import { ArticleCoverGenerator } from "@/features/cms/components/article-cover-generator";
import { AffiliateRewriteAudit } from "@/features/cms/components/affiliate-rewrite-audit";
import { PostProductionContextPanel } from "@/features/cms/components/post-production-context-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

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
import { type PostEditFormData } from "@/types/post.types";
import { toast } from "sonner";
import { notifyActionError } from "@/lib/admin-toast";
import { rewriteDraftAffiliateLinksAction } from "@/features/cms/actions/affiliate-rewrite";
import { type AffiliateRewriteReport } from "@fwqgo/scrape/affiliate-link-rewriter";
import { type NewTag } from "@/types";
import { Separator } from "@/components/ui/separator";
import {
  AdminPageShell,
  AdminSectionCard,
} from "@/features/cms/components/admin-page-shell";
import { type getPostProductionContext } from "@/features/cms/data/post";
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
}: {
  post: PostEditFormData;
  categories: Category[];
  postMeta: {
    title: string;
    slug: string;
    language: string;
  };
  productionContext: ProductionContext | null;
}) {
  const postLanguage = postMeta.language === "en" ? "en" : "zh";
  const publicPostHref =
    postLanguage === "en"
      ? `/en/fwq/posts/${postMeta.slug}`
      : `/fwq/posts/${postMeta.slug}`;
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
  const handleAddTag = (tagInput: string) => {
    const name = tagInput.trim();
    if (!name) return;

    if (name.length > 40) {
      toast.error("标签名称不能超过 40 个字符");
      return;
    }

    if (postLanguage === "en" && /\p{Script=Han}/u.test(name)) {
      toast.error("英文文章只能添加英文标签");
      return;
    }

    const normalizedName = name.toLowerCase();
    if (
      tags.some((tag) => tag.tag.name.trim().toLowerCase() === normalizedName)
    ) {
      toast.info("这个标签已经添加过了");
      return;
    }

    const newTag = {
      tag: {
        name,
        slug: "",
      },
    };

    setTags(tags ? [...tags, newTag] : [newTag]);
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
    const parsedCategoryId = Number(categoryId);

    if (!normalizedContent || !normalizedDescription) {
      toast.error("请填写内容和简述");
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
    if (tags.length === 0) {
      toast.error("请添加标签");
      return;
    }
    try {
      setIsSubmitting(true);
      const response = await fetch(`/api/cms/posts/${post.post.id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: normalizedDescription,
          content: normalizedContent,
          imgUrl: imageUrl || null,
          categoryId: parsedCategoryId,
          recommendTagName: recommendTagName.trim(),
          keywords: limitKeywordInput(keywords),
          oldTags: post.tags,
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
      title="修改文章"
      description="编辑文章正文、分类、标签和 SEO 信息。"
      actions={
        <>
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
      {productionContext ? (
        <PostProductionContextPanel context={productionContext} />
      ) : null}

      <form className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
        <AdminSectionCard title="正文编辑" description={postMeta.title}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-medium">文章内容</label>
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
            <MarkdownEditor content={content} onChange={setContent} />
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
            title="发布设置"
            description="分类、标签和摘要会影响前台展示与 SEO。"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">文章简述</label>
                <Textarea
                  value={description ?? ""}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="输入内容简述"
                  required
                  className="min-h-28 resize-y"
                />
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium">封面图片</label>
                  <ArticleCoverGenerator
                    postId={post.post.id}
                    title={postMeta.title}
                    description={description ?? ""}
                    keywords={keywords}
                    content={content}
                    fileSlug={postMeta.slug}
                    language={postLanguage}
                    onGenerated={setImageUrl}
                  />
                </div>
                <ImageUpload value={imageUrl} onChange={setImageUrl} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">分类</label>
                  <Select
                    value={categoryId}
                    onValueChange={(value) => setCategoryId(value)}
                  >
                    <SelectTrigger className="h-10 w-full">
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
                  <label className="text-sm font-medium">推荐标签</label>
                  <Input
                    className="h-10"
                    value={recommendTagName}
                    onChange={(e) => setRecommendTagName(e.target.value)}
                    placeholder="用于详情页内链推荐"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">标签</label>
                <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-border/70 bg-background p-2">
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
                        className="ml-1 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => handleRemoveTag(tag.tag.name)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </Badge>
                  ))}

                  {isAddingTag ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="输入标签名称"
                        className="w-40"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
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
                <label className="text-nowrap text-sm font-medium">
                  关键词
                </label>
                <p className="text-xs leading-5 text-muted-foreground">
                  关键词之间用逗号分隔，建议 2-6 个，单个关键词保持简短。
                </p>
                <Input
                  className="h-10 w-full"
                  value={keywords}
                  onChange={(e) =>
                    setKeywords(limitKeywordInput(e.target.value))
                  }
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

          <div className="sticky bottom-4 rounded-lg border border-border/70 bg-background/95 p-3 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-muted-foreground">
                保存后会更新文章正文、分类、推荐标签、关键词和标签关系。
              </p>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmit}
                className="h-10 min-w-32"
              >
                <Save className="size-4" />
                {isSubmitting ? "更新中..." : "更新文章"}
              </Button>
            </div>
          </div>
        </div>
      </form>
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
      label: "正文长度",
      ok: plainText.length >= 800,
      note: `当前 ${plainText.length} 字，建议至少 800 字。`,
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
