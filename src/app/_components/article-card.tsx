import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { type Post, type Tag } from "@prisma/client";

import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";
import { Suspense } from "react";
import { formatDate } from "@/lib/utils";
// 定义联合类型
// 只选择需要的字段
type SelectedPost = Pick<
  Post,
  "id" | "title" | "description" | "slug" | "imgUrl" | "createdAt"
>;

// 定义包含关联数据的类型
type PostWithTags = SelectedPost & {
  tags: {
    tag: Pick<Tag, "id" | "name" | "slug">;
  }[];
};
function ArticleCard({ post }: { post: PostWithTags }) {
  return (
    <Card
      key={post.id}
      className="flex h-[192px] w-full items-center overflow-hidden px-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
    >
      <Link href={`/fwq/posts/${post.slug}`}>
        <div className="relative h-[180px] w-[250px] overflow-hidden rounded-lg">
          <Suspense
            fallback={<div className="h-full w-full bg-gray-300"></div>}
          >
            {post.imgUrl ? (
              <Image
                src={post.imgUrl}
                alt={post.title}
                fill
                sizes="(max-width: 768px) 200px, lg:250px"
                className="object-cover object-center"
              />
            ) : (
              <div className="h-[180px] bg-gray-300 lg:w-[250px]"></div>
            )}
          </Suspense>
        </div>
      </Link>
      <CardContent className="flex flex-col justify-between p-5">
        <h3 className="mb-2 line-clamp-3 h-14 text-lg font-semibold text-gray-800 transition-colors duration-300 hover:text-blue-600">
          <Link href={`/fwq/posts/${post.slug}`}>{post.title}</Link>
        </h3>
        <p className="mb-4 line-clamp-3 text-sm text-gray-600/80">
          {post.description}
        </p>
        <div className="flex h-8 items-center justify-between">
          <div className="hidden gap-2 md:flex">
            {post.tags.slice(0, 4).map((tag) => (
              <Badge key={tag.tag.id} variant="secondary" className="text-xs">
                <Link href={`/fwq/tags/${tag.tag.slug}`}>{tag.tag.name}</Link>
              </Badge>
            ))}
          </div>

          <div className="flex items-center space-x-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-500">
              {formatDate(post.createdAt)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ArticleCard;
