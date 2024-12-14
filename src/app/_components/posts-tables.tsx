"use client";

import { type Post } from "@prisma/client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { CircleCheck, CircleX } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { deletePostById, updatePost } from "../_actions/post";
import { toast } from "sonner";
import Link from "next/link";

type PostListProp = Pick<
  Post,
  "id" | "title" | "published" | "imgUrl" | "slug"
>;

export function PostList({ posts }: { posts: PostListProp[] }) {
  const [editPostId, setEditPostId] = useState<number | null>(null);
  const [editPostData, setEditPostData] = useState<PostListProp | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // 删除post
  const handleDelete = async (id: number) => {
    const { error } = await deletePostById(id);
    if (error) {
      toast.error("删除文章失败");
    } else {
      toast.success("删除文章成功");
    }
  };

  // 处理input输入
  const handleInputChange = (
    id: number,
    key: keyof PostListProp,
    value: string | boolean,
  ) => {
    setEditPostData((prev) => {
      if (!prev) return null;
      return { ...prev, [key]: value } as PostListProp;
    });
  };

  // 保存编辑
  const handleSave = async (postId: number) => {
    if (!editPostData) return;
    if (editPostData.id !== postId) return;
    setIsSaving(true);
    const { error } = await updatePost({ ...editPostData });
    if (error) {
      console.log(error);
    }
    toast.success("更新文章成功");
    setEditPostId(null);
    setIsSaving(false);
  };

  return (
    <Table className="space-y-4">
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead className="text-nowrap">文章标题</TableHead>
          <TableHead className="text-nowrap">slug</TableHead>
          <TableHead className="text-nowrap text-center">发布</TableHead>
          <TableHead className="text-nowrap">图片链接</TableHead>
          <TableHead className="text-center">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {posts.map((post) => (
          <TableRow key={post.id}>
            <TableCell>{post.id}</TableCell>
            <TableCell className="text-nowrap">
              {editPostId === post.id ? (
                <Input
                  className="h-8"
                  autoFocus
                  value={editPostData?.title}
                  onChange={(e) =>
                    handleInputChange(post.id, "title", e.target.value)
                  }
                />
              ) : (
                post.title
              )}
            </TableCell>
            <TableCell className="text-nowrap">
              {editPostId === post.id ? (
                <Input
                  className="h-8"
                  value={editPostData?.slug}
                  onChange={(e) =>
                    handleInputChange(post.id, "slug", e.target.value)
                  }
                />
              ) : (
                <Link href={`/end/edit/post/${post.slug}`}>{post.slug}</Link>
              )}
            </TableCell>
            <TableCell className="p-0 text-center">
              {editPostId === post.id ? (
                <Checkbox
                  className="h-5 w-5 rounded-full"
                  checked={editPostData?.published ?? false}
                  onCheckedChange={(checked) =>
                    handleInputChange(post.id, "published", checked as boolean)
                  }
                />
              ) : post.published ? (
                <CircleCheck className="mx-auto text-primary" size={20} />
              ) : (
                <CircleX className="text-error mx-auto" size={20} />
              )}
            </TableCell>
            <TableCell className="text-nowrap">
              {editPostId === post.id ? (
                <Input
                  className="h-8"
                  value={editPostData?.imgUrl ?? ""}
                  onChange={(e) =>
                    handleInputChange(post.id, "imgUrl", e.target.value)
                  }
                />
              ) : (
                post.imgUrl
              )}
            </TableCell>
            <TableCell className="flex justify-center gap-2">
              {editPostId === post.id ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditPostId(null)}
                  >
                    取消
                  </Button>
                  <Button size="sm" onClick={() => handleSave(post.id)}>
                    {isSaving ? "保存中..." : "保存"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditPostId(post.id);
                      setEditPostData(post);
                    }}
                  >
                    编辑
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        删除
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          确定要将
                          <span className="text-red-500"> 文章{post.id} </span>
                          删除吗？
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          删除后将无法恢复,当前删除的文章为
                          <p className="text-red-500">{post.title}</p>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(post.id)}
                        >
                          确定删除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
