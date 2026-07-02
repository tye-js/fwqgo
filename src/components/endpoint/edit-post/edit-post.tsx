"use client";
import { useState } from "react";
import Link from "next/link";

import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { ImageUpload } from "@/features/cms/components/image-upload";
import { ArticleCoverGenerator } from "@/features/cms/components/article-cover-generator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

import { ArrowLeft, ExternalLink, FileText, Save, Tags, Wand2, X } from "lucide-react";

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
import { rewriteDraftAffiliateLinksAction } from "@/features/cms/actions/affiliate-rewrite";
import {
  updatePostContent,
  updatePostEnglishContent,
  updatePostTags,
} from "@/features/cms/actions/post";
import { type AffiliateRewriteReport } from "@fwqgo/scrape/affiliate-link-rewriter";
import { type NewTag } from "@/types";
import { Separator } from "@/components/ui/separator";
import { AdminPageShell, AdminSectionCard } from "@/features/cms/components/admin-page-shell";
interface Category {
  id: number;
  name: string;
}

export default function EditPost({
  post,
  categories,
  postMeta,
}: {
  post: PostEditFormData;
  categories: Category[];
  postMeta: {
    title: string;
    slug: string;
  };
}) {
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
  const [keywords, setKeywords] = useState<string>(post.post.keywords ?? "");
  const [enTitle, setEnTitle] = useState(post.post.enTitle ?? "");
  const [enSlug, setEnSlug] = useState(post.post.enSlug ?? "");
  const [enDescription, setEnDescription] = useState(
    post.post.enDescription ?? "",
  );
  const [enContent, setEnContent] = useState(post.post.enContent ?? "");
  const [enKeywords, setEnKeywords] = useState(post.post.enKeywords ?? "");
  const [enImageUrl, setEnImageUrl] = useState(post.post.enImgUrl ?? "");
  const [isSavingEnglish, setIsSavingEnglish] = useState(false);
  const handleAddTag = (tagInput: string) => {
    const name = tagInput.trim();
    if (!name) return;

    if (tags.some((tag) => tag.tag.name.trim() === name)) {
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
    if (!content || !description) {
      toast.error("请填写内容和简述");
      return;
    }
    if (!tags) {
      toast.error("请添加标签");
      return;
    }
    try {
      setIsSubmitting(true);
      // 更新文章标签
      const tagsResult = await updatePostTags({
        postId: post.post.id,
        oldTags: post.tags,
        newTags: tags,
      });

      if (tagsResult.error) {
        throw new Error(tagsResult.error);
      }
      // 更新文章内容
      const result = await updatePostContent({
        id: post.post.id,
        description,
        content,
        imgUrl: imageUrl,
        categoryId: parseInt(categoryId),
        recommendTagName,
        keywords: keywords.toString(),
      });
      if (result.error) {
        throw new Error(result.error);
      }
      toast.success("更新文章成功");
    } catch (error) {
      console.error("更新文章失败:", error);
      toast.error("更新文章失败，请重试");
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

  const handleSubmitEnglish = async () => {
    if (!enTitle.trim() || !enSlug.trim() || !enContent.trim()) {
      toast.error("请填写英文标题、slug 和正文");
      return;
    }

    setIsSavingEnglish(true);
    try {
      const result = await updatePostEnglishContent({
        id: post.post.id,
        enTitle,
        enSlug,
        enDescription,
        enContent,
        enKeywords,
        enImgUrl: enImageUrl,
      });

      if (result.error) {
        throw new Error(result.message ?? result.error);
      }

      toast.success("英文 SEO 版本已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "英文版本保存失败");
    } finally {
      setIsSavingEnglish(false);
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
  const englishSeoChecks = buildSeoChecks({
    content: enContent,
    description: enDescription,
    keywords: enKeywords,
    tagCount: tags.length,
    recommendTagName,
  });
  const failedEnglishSeoChecks = englishSeoChecks.filter((item) => !item.ok);

  return (
    <AdminPageShell
      badge="文章编辑"
      title="修改文章"
      description="编辑文章正文、分类、标签和 SEO 信息。"
      actions={
        <>
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href="/end/posts/edit">
              <ArrowLeft className="size-4" />
              返回列表
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link
              href={`/fwq/posts/${postMeta.slug}`}
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
      <form className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)]">
        <AdminSectionCard title="正文编辑" description={postMeta.title}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-medium">文章内容</label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                disabled={isRewritingLinks}
                onClick={handleRewriteAffiliateLinks}
              >
                <Wand2 className="size-4" />
                {isRewritingLinks ? "替换中..." : "替换返利链接"}
              </Button>
            </div>
            <TiptapEditor content={content} onChange={setContent} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <FileText className="size-3.5" />
                正文字数
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {content.length}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Tags className="size-3.5" />
                当前标签
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {tags.length}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Save className="size-3.5" />
                SEO 通过
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {seoChecks.filter((item) => item.ok).length}/{seoChecks.length}
              </p>
            </div>
          </div>

          {affiliateReport ? (
            <div className="mt-4 space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">总链接 {affiliateReport.totalLinks}</Badge>
                  <Badge variant="secondary">
                    命中 {affiliateReport.matchedLinks.length}
                  </Badge>
                  <Badge
                    variant={
                      affiliateReport.unmatchedLinks.length > 0
                        ? "destructive"
                        : "outline"
                    }
                  >
                    未命中 {affiliateReport.unmatchedLinks.length}
                  </Badge>
                </div>
                <Button asChild variant="outline" size="sm" className="h-9">
                  <Link href="/end/collect/aff-man">补返利规则</Link>
                </Button>
              </div>

              {affiliateReport.matchedLinks.length > 0 ? (
                <div className="space-y-2">
                  <p className="font-medium">命中商家</p>
                  <div className="space-y-2">
                    {affiliateReport.matchedLinks.slice(0, 5).map((item, index) => (
                      <div
                        key={`${item.finalHref}-${index}`}
                        className="rounded-md border border-border/70 bg-background p-3 text-xs"
                      >
                        <div className="flex flex-wrap gap-2">
                          <Badge>{item.providerName}</Badge>
                          <Badge variant="outline">{item.matchedDomain}</Badge>
                          <Badge variant="secondary">
                            {item.mode === "replace" ? "替换" : "追加参数"}
                          </Badge>
                        </div>
                        <p className="mt-2 break-all text-muted-foreground">
                          原链接：{item.resolvedHref}
                        </p>
                        <p className="mt-1 break-all text-muted-foreground">
                          返利：{item.finalHref}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {affiliateReport.unmatchedLinks.length > 0 ? (
                <div className="space-y-2">
                  <p className="font-medium">未命中域名</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ...new Set(
                        affiliateReport.unmatchedLinks
                          .map((item) => item.host)
                          .filter(Boolean),
                      ),
                    ].map((host) => (
                      <Badge key={host} variant="outline">
                        {host}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </AdminSectionCard>

        <div className="space-y-5">
          <AdminSectionCard title="发布设置" description="分类、标签和摘要会影响前台展示与 SEO。">
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
                    title={postMeta.title}
                    description={description ?? ""}
                    keywords={keywords}
                    content={content}
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
                      className="h-8 gap-1 rounded-md px-2.5"
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
                        className="h-8 w-36"
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
                        className="h-8"
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
                      className="h-8 px-3"
                      onClick={() => setIsAddingTag(true)}
                    >
                      添加标签
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <label className="text-nowrap text-sm font-medium">关键词</label>
                <p className="text-xs leading-5 text-muted-foreground">
                  关键词之间用逗号分隔，建议 2-6 个，单个关键词保持简短。
                </p>
                <Input
                  className="h-10 w-full"
                  value={keywords}
                  onChange={(e) =>
                    setKeywords(e.target.value.replace(/，/g, ",").toString())
                  }
                  placeholder="香港服务器,独立服务器,CN2"
                />
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="SEO 检查" description="即时评估，不会阻止保存。">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">当前完成度</p>
                <Badge variant={seoChecks.every((item) => item.ok) ? "default" : "secondary"}>
                  {seoChecks.filter((item) => item.ok).length}/{seoChecks.length}
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

          <AdminSectionCard
            title="英文 SEO 版本"
            description="英文内容独立保存，前台通过 /en/fwq/posts/[slug] 访问。"
          >
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">英文标题</label>
                  <Input
                    className="h-10"
                    value={enTitle}
                    onChange={(e) => setEnTitle(e.target.value)}
                    placeholder="English title"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">英文 Slug</label>
                  <Input
                    className="h-10"
                    value={enSlug}
                    onChange={(e) => setEnSlug(e.target.value)}
                    placeholder="cheap-hong-kong-vps"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">英文摘要</label>
                <Textarea
                  value={enDescription}
                  onChange={(e) => setEnDescription(e.target.value)}
                  placeholder="English meta description"
                  className="min-h-24 resize-y"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">英文关键词</label>
                <Input
                  className="h-10"
                  value={enKeywords}
                  onChange={(e) =>
                    setEnKeywords(e.target.value.replace(/，/g, ","))
                  }
                  placeholder="hong kong vps, cheap server, cn2 gia"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">英文封面</label>
                <ImageUpload value={enImageUrl} onChange={setEnImageUrl} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">英文正文</label>
                <TiptapEditor content={enContent} onChange={setEnContent} />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    英文 SEO 未通过项
                  </p>
                  <Badge
                    variant={
                      failedEnglishSeoChecks.length === 0
                        ? "default"
                        : "secondary"
                    }
                  >
                    {englishSeoChecks.length - failedEnglishSeoChecks.length}/
                    {englishSeoChecks.length}
                  </Badge>
                </div>
                {failedEnglishSeoChecks.length === 0 ? (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    英文 SEO 检查已全部通过。
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {failedEnglishSeoChecks.map((check) => (
                      <div
                        key={check.label}
                        className="rounded-md border border-border/60 bg-background px-3 py-2 text-sm"
                      >
                        <p className="font-medium">{check.label}</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {check.note}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  英文版本为空时，英文前台不会展示该文章；保存后会刷新英文文章缓存。
                </p>
                <div className="flex flex-wrap gap-2">
                  {enSlug.trim() ? (
                    <Button asChild variant="outline" size="sm" className="h-9">
                      <Link
                        href={`/en/fwq/posts/${encodeURIComponent(enSlug.trim())}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="size-4" />
                        查看英文页
                      </Link>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    className="h-9"
                    disabled={isSavingEnglish}
                    onClick={handleSubmitEnglish}
                  >
                    <Save className="size-4" />
                    {isSavingEnglish ? "保存中..." : "保存英文版本"}
                  </Button>
                </div>
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

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function buildSeoChecks(input: {
  content: string;
  description: string;
  keywords: string;
  tagCount: number;
  recommendTagName: string;
}) {
  const plainText = stripHtml(input.content);
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
      ok: /<h2|<h3/i.test(input.content),
      note: /<h2|<h3/i.test(input.content)
        ? "正文包含小标题。"
        : "建议增加 H2/H3 小标题。",
    },
  ];
}
