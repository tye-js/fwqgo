import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { type Post, type Tag } from "@prisma/client";

import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";
// 定义联合类型
// 只选择需要的字段
type SelectedPost = Pick<
  Post,
  "id" | "title" | "description" | "slug" | "img" | "createdAt"
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
      className="overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
    >
      <Link href={`/fwq/posts/${post.slug}`}>
        <div className="relative h-48 w-full overflow-hidden">
          <Image
            src={post.img ?? "/img/placeholders/fwq-placeholder.png"}
            alt={post.title}
            fill
            objectFit="cover"
          />
        </div>
      </Link>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center space-x-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-500">
            {post.createdAt.toLocaleDateString("zh-CN", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <h3 className="mb-2 line-clamp-2 text-xl font-semibold text-gray-800 transition-colors duration-300 hover:text-blue-600">
          <Link href={`/fwq/posts/${post.slug}`}>{post.title}</Link>
        </h3>
        <p className="mb-4 line-clamp-3 text-sm text-gray-600">
          {post.description}
        </p>
        <div className="flex flex-wrap gap-2">
          {post.tags.slice(0, 3).map((tag) => (
            <Badge key={tag.tag.id} variant="secondary" className="text-xs">
              <Link href={`/fwq/tags/${tag.tag.slug}`}>{tag.tag.name}</Link>
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default ArticleCard;
