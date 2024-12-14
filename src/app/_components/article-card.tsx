import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";

import { Card, CardContent } from "@/components/ui/card";

import { Suspense } from "react";
import { formatDate } from "@/lib/utils";
import { type PostWithTags } from "@/types";

function ArticleCard({ post }: { post: PostWithTags }) {
  return (
    <Card
      key={post.id}
      className="flex w-full items-center overflow-hidden px-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg md:h-[150px] lg:h-[192px]"
    >
      <Link href={`/fwq/posts/${post.slug}`}>
        <div className="relative h-[90px] w-[120px] overflow-hidden rounded-lg md:h-[120px] md:w-[160px] lg:h-[150px] lg:w-[200px]">
          <Suspense
            fallback={<div className="h-full w-full bg-gray-300"></div>}
          >
            {post.imgUrl ? (
              <Image
                src={process.env.NEXT_PUBLIC_URL + post.imgUrl}
                alt={post.title}
                fill
                sizes="150px,(max-width: 768px) 200px, (max-width: 1024px)300px"
                className="object-cover object-center"
                quality={100}
              />
            ) : (
              <div className="h-full w-full bg-gray-300"></div>
            )}
          </Suspense>
        </div>
      </Link>
      <CardContent className="flex w-full flex-col justify-between p-5">
        <Link href={`/fwq/posts/${post.slug}`}>
          <h3 className="mb-2 line-clamp-3 h-14 text-lg font-semibold text-gray-800 transition-colors duration-300 hover:text-blue-600">
            {post.title}
          </h3>
        </Link>
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
