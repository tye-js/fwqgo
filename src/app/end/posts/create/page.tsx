"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/app/_components/image-upload";
import { createPost } from "@/app/_actions/creat-post";

import { getLeafCategories } from "@/app/_actions/category";
import { AdminPageShell, AdminSectionCard } from "@/app/_components/admin-page-shell";
import { ScraperForm } from "@/app/_components/scraper-form";
import { FileText, Tags, Wand2, X } from "lucide-react";

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

interface Category {
  id: number;
  name: string;
}
export interface Tag {
  name: string;
}
export default function CreatePost() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("8");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [recommendTag, setRecommendTag] = useState<Tag>({ name: "" });
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);

  const handleAddTag = () => {
    if (!tagInput.trim()) return;

    const newTag = {
      id: Date.now().toString(),
      name: tagInput.trim(),
    };

    setTags([...tags, newTag]);
    setTagInput("");
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagName: string) => {
    setTags(tags.filter((tag) => tag.name !== tagName));
  };

  useEffect(() => {
    async function fetchCategories() {
      const result = await getLeafCategories();
      if (result.data) {
        setCategories(result.data);
      }
    }
    void fetchCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    // 添加阻止事件冒泡
    e.stopPropagation();
    e.preventDefault();
    if (!title || !content || !description) {
      toast.error("请填写标题、内容和简述");
      return;
    }

    try {
      setIsSubmitting(true);
      // 向数据库中插入文章
      await createPost({
        post: {
          title: title.trim(),
          description: description.trim(),
          content,
          imgUrl: imageUrl,
          published: true,
          categoryId: parseInt(categoryId),
          recommendedTagName: recommendTag.name,
          keywords: keywords.join(",").toString(),
        },
        tags,
      });

      // 跳转到文章详情页
      router.push(`/end/posts/edit/`);
    } catch (error) {
      console.error("创建文章失败:", error);
      toast.error("创建文章失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!title || !content || !description) {
      toast.error("请填写标题、内容和简述");
      return;
    }

    try {
      setIsSaving(true);

      await createPost({
        post: {
          title: title.trim(),
          description: description.trim(),
          content,
          imgUrl: imageUrl,
          published: false,
          categoryId: parseInt(categoryId),
          recommendedTagName: recommendTag.name,
          keywords: keywords.join(",").toString(),
        },
        tags,
      });

      toast.success("保存文章成功");
    } catch (error) {
      console.error("保存文章失败:", error);
      toast.error("保存文章失败，请重试");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AdminPageShell
      badge="内容创作"
      title="新建文章"
      description="把采集、编辑、封面和元信息整合到一个创作工作台里，更适合连续写作与发布。"
    >
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
      <form className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <AdminSectionCard title="正文编辑器" description="文章主体内容会在这里完成。">
          <div className="space-y-2">
            <label className="text-sm font-medium">文章内容</label>
            <TiptapEditor content={content} onChange={setContent} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <FileText className="size-3.5" />
                正文字数
              </div>
              <p className="mt-3 text-2xl font-semibold text-foreground">
                {content.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <Tags className="size-3.5" />
                当前标签
              </div>
              <p className="mt-3 text-2xl font-semibold text-foreground">
                {tags.length}
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                <Wand2 className="size-3.5" />
                关键词数
              </div>
              <p className="mt-3 text-2xl font-semibold text-foreground">
                {keywords.filter(Boolean).length}
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
              placeholder="输入文章标题"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">内容简述</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="输入内容简述"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">分类</label>
            <Select
              defaultValue={"8"}
              onValueChange={(value) => setCategoryId(value)}
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
                      if (e.key === "Enter") handleAddTag();
                      if (e.key === "Escape") setIsAddingTag(false);
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
            <label className="text-sm font-medium">封面图片</label>
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
              建议：关键词之间用逗号分隔，最多支持5个,单个关键词不超过6个汉字
            </p>
            <Input
              className="w-full"
              value={keywords.join(",")}
              onChange={(e) =>
                setKeywords(e.target.value.replace(/，/g, ",").split(","))
              }
            />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 md:flex-row md:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              className="md:min-w-[140px]"
              onClick={handleSaveDraft}
            >
              {isSaving ? "存储中..." : "存为草稿"}
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="md:min-w-[140px]"
            >
              {isSubmitting ? "发布中..." : "发布文章"}
            </Button>
          </div>
        </div>
        </AdminSectionCard>
      </form>
    </AdminPageShell>
  );
}
