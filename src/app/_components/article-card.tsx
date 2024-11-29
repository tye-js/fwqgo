import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { type Post, type Tag } from "@prisma/client";

import { Card, CardContent } from "@/components/ui/card";

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
      className="flex h-[114px] w-full items-center overflow-hidden px-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg md:h-[150px] lg:h-[192px]"
    >
      <Link href={`/fwq/posts/${post.slug}`}>
        <div className="relative h-[108px] w-[150px] overflow-hidden rounded-lg md:h-[144px] md:w-[200px] lg:h-[180px] lg:w-[250px]">
          <Suspense
            fallback={<div className="h-full w-full bg-gray-300"></div>}
          >
            {post.imgUrl ? (
              <Image
                src={post.imgUrl}
                alt={post.title}
                fill
                sizes="150px,(max-width: 768px) 200px, (max-width: 1024px)250px"
                className="object-cover object-center"
              />
            ) : (
              <div className="h-full w-full bg-gray-300"></div>
            )}
          </Suspense>
        </div>
      </Link>
      <CardContent className="flex flex-col justify-between p-5">
        <h3 className="mb-2 line-clamp-3 h-14 text-lg font-semibold text-gray-800 transition-colors duration-300 hover:text-blue-600">
          <Link href={`/fwq/posts/${post.slug}`}>{post.title}</Link>
        </h3>
        <p className="mb-2 line-clamp-2 hidden text-sm text-gray-600/80 md:block lg:mb-4 lg:line-clamp-3">
          {post.description}
        </p>
        <div className="hidden h-8 items-center justify-between lg:flex">
          <div className="hidden gap-2 lg:flex">
            {post.tags.slice(0, 4).map((tag) => (
              <Badge key={tag.tag.id} variant="secondary" className="text-xs">
                <Link href={`/fwq/tags/${tag.tag.slug}/page/1`}>
                  {tag.tag.name}
                </Link>
              </Badge>
            ))}
          </div>

          <div className="flex items-center space-x-2">
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
