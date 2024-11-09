"use client";

import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ImageUpload } from "@/app/_components/image-upload";
import { createPost } from "@/app/_actions/post";
import { getAllCategories } from "@/app/_actions/category";

import { X } from "lucide-react"; // 添加这个import用于显示删除图标

interface Tag {
  id: string;
  name: string;
}

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// import CategorySelect from "@/app/_components/create-post/category-select";
interface Category {
  id: number;
  name: string;
}
export default function CreatePost() {
  // const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [categoryId, setCategoryId] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleRemoveTag = (tagId: string) => {
    setTags(tags.filter((tag) => tag.id !== tagId));
  };

  useEffect(() => {
    async function fetchCategories() {
      const result = await getAllCategories();
      if (result.data) {
        setCategories(result.data);
      }
    }
    void fetchCategories();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !content) {
      alert("请填写标题和内容");
      return;
    }

    try {
      setIsSubmitting(true);

      const result = await createPost({
        title,
        content,
        img: imageUrl,
        published: true,
        categoryId: parseInt(categoryId),
      });

      if (result.error) {
        throw new Error(result.error);
      }

      // router.push("/posts");
    } catch (error) {
      console.error("创建文章失败:", error);
      alert("创建文章失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4">
      <h1 className="text-2xl font-bold">创建新文章</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="text-sm font-medium">文章标题</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="输入文章标题"
            required
          />
        </div>
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium">分类</label>
          <Select
            defaultValue={"1"}
            onValueChange={(value) => setCategoryId(value)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="选择分类" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>文章分类</SelectLabel>
                {categories.map((category) => (
                  <SelectItem value={category.id.toString()} key={category.id}>
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
              <div
                key={tag.id}
                className="flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1"
              >
                <span>{tag.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag.id)}
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
          <label className="text-sm font-medium">文章内容</label>
          <TiptapEditor content={content} onChange={setContent} />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "发布中..." : "发布文章"}
        </Button>
      </form>
    </div>
  );
}
