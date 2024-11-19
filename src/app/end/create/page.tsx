"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ImageUpload } from "@/app/_components/image-upload";
import { createPost } from "@/app/_actions/post";
import { createTags } from "@/app/_actions/tag";
import { createPostTags } from "@/app/_actions/post-tag";
import { getLeafCategories } from "@/app/_actions/category";

import { X } from "lucide-react"; // 添加这个import用于显示删除图标

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

interface Category {
  id: number;
  name: string;
}
interface Tag {
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

  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);

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
      const result = await createPost({
        title,
        description,
        content,
        img: imageUrl,
        published: true,
        categoryId: parseInt(categoryId),
      });

      if (result.error) {
        throw new Error(result.error);
      }
      // 向数据库中插入标签
      const resultTags = await createTags(tags);
      // 向数据库中插入文章标签关联
      // 获得文章id
      const postId = result.data?.id;
      if (!postId) {
        throw new Error("写入文章存在");
      }
      // if (!resultTags.data) {
      //   throw new Error("写入标签存在");
      // }
      const tagsArray = resultTags.data;

      // 向数据库中插入文章标签关联
      const resultPostTags = await createPostTags({
        postId,
        tags: tagsArray,
      });
      if (resultPostTags.error) {
        throw new Error(resultPostTags.error);
      }
      // 跳转到文章详情页
      router.push(`/fwq/posts/${result.data?.slug}`);
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

      const result = await createPost({
        title,
        description,
        content,
        img: imageUrl,
        published: false,
        categoryId: parseInt(categoryId),
      });

      if (result.error) {
        throw new Error(result.error);
      }
      toast.success("保存文章成功");
    } catch (error) {
      console.error("保存文章失败:", error);
      toast.error("保存文章失败，请重试");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mx-auto min-h-[85vh]">
      <h1 className="text-2xl font-bold">创建新文章</h1>
      <form className="grid min-h-[80vh] grid-cols-6 gap-8">
        <div className="col-span-3 space-y-2">
          <label className="text-sm font-medium">文章内容</label>
          <TiptapEditor content={content} onChange={setContent} />
        </div>
        <div className="col-span-3 space-y-4">
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
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium">分类</label>
            <Select
              defaultValue={"8"}
              onValueChange={(value) => setCategoryId(value)}
            >
              <SelectTrigger className="w-[180px]">
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
              {tags.map((tag) => (
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
          <div className="flex justify-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              className="w-1/4"
              onClick={handleSaveDraft}
            >
              {isSaving ? "存储中..." : "存为草稿"}
            </Button>
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="w-1/4"
            >
              {isSubmitting ? "发布中..." : "发布文章"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
