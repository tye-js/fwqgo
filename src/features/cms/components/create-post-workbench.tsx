"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/features/cms/components/image-upload";
import { createPost } from "@/features/cms/actions/creat-post";

import { AdminSectionCard } from "@/features/cms/components/admin-page-shell";
import { ScraperForm } from "@/features/cms/components/scraper-form";
import { ArticleCoverGenerator } from "@/features/cms/components/article-cover-generator";
import { AlertCircle, FileText, Tags, Wand2, X } from "lucide-react";

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
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";

export type CreatePostCategory = {
  id: number;
  name: string;
};

export type CreatePostTag = {
  name: string;
};

export function CreatePostWorkbench({
  categories,
}: {
  categories: CreatePostCategory[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState(
    categories[0] ? String(categories[0].id) : "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const mutationRef = useRef<"publish" | "draft" | null>(null);
  const [recommendTag, setRecommendTag] = useState<CreatePostTag>({ name: "" });
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<CreatePostTag[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const selectedCategoryId = Number(categoryId);
  const categoryIsValid =
    Number.isInteger(selectedCategoryId) &&
    categories.some((category) => category.id === selectedCategoryId);
  const normalizedKeywords = keywords
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .slice(0, 6);
  const seoChecks = buildCreateSeoChecks({
    title,
    content,
    description,
    keywords: normalizedKeywords,
    tagCount: tags.length,
    recommendTagName: recommendTag.name,
    imageUrl,
    categoryId,
  });
  const seoPassedCount = seoChecks.filter((check) => check.ok).length;
  const failedSeoChecks = seoChecks.filter((check) => !check.ok);

  const handleAddTag = () => {
    const name = tagInput.trim();
    if (!name) return;

    if (tags.some((tag) => tag.name.trim() === name)) {
      toast.info("这个标签已经添加过了");
      return;
    }

    setTags([...tags, { name }]);
    setTagInput("");
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagName: string) => {
    setTags(tags.filter((tag) => tag.name !== tagName));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (mutationRef.current) return;

    const missingFields = getMissingRequiredFields({ title, content, description });
    if (missingFields.length > 0) {
      toast.error(`发布前请补全：${missingFields.join("、")}`);
      return;
    }
    if (!categoryIsValid) {
      toast.error("请先选择文章分类");
      return;
    }

    try {
      mutationRef.current = "publish";
      setIsSubmitting(true);
      // 向数据库中插入文章
      const result = await createPost({
        post: {
          title: title.trim(),
          description: description.trim(),
          content,
          imgUrl: imageUrl,
          published: true,
          categoryId: selectedCategoryId,
          recommendedTagName: recommendTag.name,
          keywords: normalizedKeywords.join(","),
        },
        tags,
      });

      if (!result.success) {
        toast.error(result.message ?? result.error ?? "创建文章失败，请检查表单后重试");
        return;
      }

      // 跳转到文章详情页
      router.push(`/posts/edit/`);
    } catch (error) {
      console.error("创建文章失败:", error);
      toast.error("创建文章失败，请重试");
    } finally {
      mutationRef.current = null;
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (mutationRef.current) return;

    const missingFields = getMissingRequiredFields({ title, content, description });
    if (missingFields.length > 0) {
      toast.error(`保存草稿前请补全：${missingFields.join("、")}`);
      return;
    }
    if (!categoryIsValid) {
      toast.error("请先选择文章分类");
      return;
    }

    try {
      mutationRef.current = "draft";
      setIsSaving(true);

      const result = await createPost({
        post: {
          title: title.trim(),
          description: description.trim(),
          content,
          imgUrl: imageUrl,
          published: false,
          categoryId: selectedCategoryId,
          recommendedTagName: recommendTag.name,
          keywords: normalizedKeywords.join(","),
        },
        tags,
      });

      if (!result.success) {
        toast.error(result.message ?? result.error ?? "保存草稿失败，请检查表单后重试");
        return;
      }

      toast.success("草稿保存成功");
      if (result.data?.slug) {
        router.push(
          `/posts/edit/post/${encodeURIComponent(result.data.slug)}`,
        );
        router.refresh();
      } else {
        router.push("/posts/drafts");
      }
    } catch (error) {
      console.error("保存文章失败:", error);
      toast.error("保存文章失败，请重试");
    } finally {
      mutationRef.current = null;
      setIsSaving(false);
    }
  };

  return (
    <>
      <AdminSectionCard
        title="采集辅助"
        description="可以先通过采集工具生成初始内容，再进入下方编辑区完成排版和 SEO 信息。"
      >
        <ScraperForm
          setContent={setContent}
          setTitle={setTitle}
          setDescription={setDescription}
          setKeywords={setKeywords}
          setRecommendTag={setRecommendTag}
          setTags={setTags}
        />
      </AdminSectionCard>
      <form
        className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]"
        onSubmit={handleSubmit}
      >
        <AdminSectionCard title="正文编辑器" description="文章主体内容会在这里完成。">
          <div className="space-y-2">
            <label className="text-sm font-medium">文章内容</label>
            <MarkdownEditor content={content} onChange={setContent} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <FileText className="size-3.5" />
                正文字数
              </div>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {content.length}
              </p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <Tags className="size-3.5" />
                当前标签
              </div>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {tags.length}
              </p>
            </div>
            <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <Wand2 className="size-3.5" />
                SEO 完成
              </div>
              <p className="mt-2 text-xl font-semibold text-foreground">
                {seoPassedCount}/{seoChecks.length}
              </p>
            </div>
          </div>
        </AdminSectionCard>
        <AdminSectionCard title="发布设置" description="填写标题、封面、分类、标签和 SEO 元信息。">
          <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">文章标题</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="建议包含商家、地区、套餐或核心优惠点"
              required
            />
            <p className="text-xs text-muted-foreground">
              当前 {title.trim().length} 字，建议 12-36 字，避免标题过短或堆关键词。
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">内容简述</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="概括优惠、适用场景、核心配置或购买理由"
              required
            />
            <p className="text-xs text-muted-foreground">
              当前 {description.trim().length} 字，建议 80-160 字，方便搜索摘要展示。
            </p>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">分类</label>
            <Select
              value={categoryId}
              onValueChange={(value) => setCategoryId(value)}
              disabled={categories.length === 0}
            >
              <SelectTrigger className="w-full">
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
            {categories.length === 0 ? (
              <p className="text-xs text-destructive">
                当前没有可选文章分类，请先在 SEO 分类中创建分类。
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">标签</label>
            <div className="flex flex-wrap items-center gap-2">
              {tags.length > 0 &&
                tags.map((tag) => (
                  <div key={tag.name} className="flex h-10 items-center gap-1">
                    <Badge variant="default">{tag.name}</Badge>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag.name)}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

              {isAddingTag ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="输入标签名称"
                    className="w-32"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTag();
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
                    onClick={handleAddTag}
                  >
                    添加
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddingTag(true)}
                >
                  +
                </Button>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-medium">封面图片</label>
              <ArticleCoverGenerator
                title={title}
                description={description}
                keywords={normalizedKeywords.join(",")}
                content={content}
                fileSlug={title}
                language="zh"
                onGenerated={setImageUrl}
              />
            </div>
            <ImageUpload value={imageUrl} onChange={setImageUrl} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">推荐标签</label>
            <Input
              value={recommendTag.name}
              onChange={(e) => setRecommendTag({ name: e.target.value })}
              placeholder="用于详情页推荐阅读"
            />
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <label className="text-nowrap text-sm font-medium">关键词</label>
            <p className="text-xs text-muted-foreground">
              建议：关键词之间用逗号分隔，保留 2-6 个核心词，优先覆盖商家、地区、线路、套餐类型。
            </p>
            <Input
              className="w-full"
              value={keywords.join(",")}
              onChange={(e) =>
                setKeywords(
                  e.target.value.replace(/，/g, ",").split(",").slice(0, 6),
                )
              }
            />
          </div>
          <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">SEO 检查</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  发布前用于快速发现标题、摘要、关键词和正文结构问题，不会阻止保存草稿。
                </p>
              </div>
              <Badge variant={seoPassedCount === seoChecks.length ? "default" : "secondary"}>
                {seoPassedCount}/{seoChecks.length}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              {failedSeoChecks.length === 0 ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  SEO 检查已全部通过。
                </div>
              ) : null}
              {failedSeoChecks.map((check) => (
                <div key={check.label} className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{check.label}</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                      {check.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-muted/20 px-4 py-3 md:flex-row md:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving || isSubmitting}
              className="md:min-w-[140px]"
              onClick={handleSaveDraft}
            >
              {isSaving ? "存储中..." : "存为草稿"}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isSaving}
              className="md:min-w-[140px]"
            >
              {isSubmitting ? "发布中..." : "发布文章"}
            </Button>
          </div>
        </div>
        </AdminSectionCard>
      </form>
    </>
  );
}

function getMissingRequiredFields(input: {
  title: string;
  content: string;
  description: string;
}) {
  const fields: string[] = [];
  if (!input.title.trim()) fields.push("标题");
  if (!markdownToPlainText(input.content).trim()) fields.push("正文内容");
  if (!input.description.trim()) fields.push("内容简述");
  return fields;
}

function buildCreateSeoChecks(input: {
  title: string;
  content: string;
  description: string;
  keywords: string[];
  tagCount: number;
  recommendTagName: string;
  imageUrl: string;
  categoryId: string;
}) {
  const plainText = markdownToPlainText(input.content);
  const titleLength = input.title.trim().length;
  const descriptionLength = input.description.trim().length;
  const keywordCount = input.keywords.length;
  const hasHeading = /^#{2,3}\s+\S+/m.test(input.content);
  const hasCoverImage = Boolean(input.imageUrl.trim());
  const hasCategory = Boolean(input.categoryId && Number.isFinite(Number(input.categoryId)));

  return [
    {
      label: "标题可读且包含核心信息",
      ok: titleLength >= 12 && titleLength <= 36,
      detail: `当前 ${titleLength} 字，建议 12-36 字，包含商家、地区、套餐或优惠点。`,
    },
    {
      label: "描述适合搜索摘要",
      ok: descriptionLength >= 80 && descriptionLength <= 160,
      detail: `当前 ${descriptionLength} 字，建议 80-160 字，说明配置、价格、地区和适用场景。`,
    },
    {
      label: "关键词数量合理",
      ok: keywordCount >= 2 && keywordCount <= 6,
      detail: `当前 ${keywordCount} 个，建议 2-6 个，避免过少或堆砌。`,
    },
    {
      label: "正文信息量充足",
      ok: plainText.length >= 800,
      detail: `当前正文约 ${plainText.length} 字，建议至少 800 字，包含套餐、价格、线路、购买说明。`,
    },
    {
      label: "正文有小标题结构",
      ok: hasHeading,
      detail: hasHeading ? "已检测到 H2/H3 小标题。" : "建议使用 H2/H3 拆分配置、优惠、购买、注意事项等段落。",
    },
    {
      label: "标签覆盖主题",
      ok: input.tagCount >= 2,
      detail: `当前 ${input.tagCount} 个标签，建议至少 2 个，覆盖商家、地区或套餐类型。`,
    },
    {
      label: "推荐标签已设置",
      ok: Boolean(input.recommendTagName.trim()),
      detail: input.recommendTagName.trim()
        ? "推荐标签会用于详情页关联推荐。"
        : "建议填写一个核心推荐标签，提升相关文章联动。",
    },
    {
      label: "封面与分类完整",
      ok: hasCoverImage && hasCategory,
      detail: hasCoverImage
        ? "已设置封面和分类。"
        : "建议补充封面图，列表页和社交分享会更完整。",
    },
  ];
}

function markdownToPlainText(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
