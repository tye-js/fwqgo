"use client";
import { useState } from "react";

import { TiptapEditor } from "@/components/editor/tiptap-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { X } from "lucide-react";

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
import { updatePostContent, updatePostTags } from "@/app/_actions/post";
import { type NewTag } from "@/types";
interface Category {
  id: number;
  name: string;
}

export default function EditPost({
  post,
  categories,
}: {
  post: PostEditFormData;
  categories: Category[];
}) {
  const [description, setDescription] = useState(post.post.description);
  const [content, setContent] = useState(post.post.content);
  const [categoryId, setCategoryId] = useState(post.post.categoryId.toString());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recommendTagName, setRecommendTagName] = useState<string>(
    post.post.recommendedTagName ?? "",
  );
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<NewTag[]>(post.tags);

  const handleAddTag = (tagInput: string) => {
    if (!tagInput.trim()) return;

    const newTag = {
      tag: {
        name: tagInput.trim(),
        slug: tagInput.trim(),
      },
    };
    console.log(newTag);

    setTags(tags ? [...tags, newTag] : [newTag]);
    console.log(tags);
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
        categoryId: parseInt(categoryId),
        recommendTagName,
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

  return (
    <div className="mx-auto min-h-[70vh]">
      <form className="grid min-h-[70vh] grid-cols-6 gap-8">
        <div className="col-span-3 space-y-2">
          <label className="text-sm font-medium">文章内容</label>
          <TiptapEditor content={content} onChange={setContent} />
        </div>
        <div className="col-span-3 space-y-4">
          <label className="text-sm font-medium">文章简述</label>
          <Textarea
            value={description!}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="输入内容简述"
            required
          />
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
                <div
                  key={tag.tag.name}
                  className="flex h-10 items-center gap-1"
                >
                  <Button
                    variant="default"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                  >
                    {tag.tag.name}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRemoveTag(tag.tag.name)}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X size={14} />
                  </Button>
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
                      if (e.key === "Enter") handleAddTag(tagInput);
                      if (e.key === "Escape") setIsAddingTag(false);
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
                  onClick={() => setIsAddingTag(true)}
                >
                  +
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">推荐标签</label>
            <Input
              className="w-32"
              value={recommendTagName}
              onChange={(e) => setRecommendTagName(e.target.value)}
            />
          </div>
          <div className="flex justify-center">
            <Button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="w-1/4"
            >
              {isSubmitting ? "更新中..." : "更新文章"}
            </Button>
          </div>
        </div>
      </form>

      {content && content.length > 0 && (
        <div className="mt-4 text-sm text-gray-500">
          文章字数：{content.length}
        </div>
      )}
    </div>
  );
}
