import React from "react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCategoryBySlug } from "@/app/_actions/category";
import { getPostByCategoryId } from "@/app/_actions/post";
import Image from "next/image";
import Link from "next/link";

const CategoryPage = async ({ params }: { params: { category: string } }) => {
  console.log(params.category);
  const { data: category, error: categoryError } = await getCategoryBySlug(
    params.category,
  );
  if (categoryError) return <div>加载失败: {categoryError}</div>;
  if (!category) return <div>加载中...</div>;
  const { data: posts, error: postsError } = await getPostByCategoryId(
    category.id,
  );
  if (postsError) return <div>加载失败: {postsError}</div>;
  if (!posts) return <div>加载中...</div>;
  return (
    <div className="mt-2 grid grid-cols-5 gap-6">
      <div className="col-span-4 space-y-4">
        {category && (
          <Card>
            <CardHeader>
              <CardTitle>{category.name}</CardTitle>
              <CardDescription>{category.description}</CardDescription>
            </CardHeader>
          </Card>
        )}
        {posts.map((post) => (
          <Card key={post.id} className="flex gap-4">
            {post.img && (
              <div className="relative h-[200px] w-[200px] overflow-hidden rounded-md">
                <Image
                  fill
                  sizes="200px"
                  className="object-cover"
                  alt={post.title}
                  src={post.img}
                  placeholder="blur"
                  loading="lazy"
                  blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABQODxIPDRQSEBIXFRQdHx0fHRsdHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR3/2wBDAR0XFyAeIRMeIR0dITcdHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR0dHR3/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k="
                />
              </div>
            )}
            <CardHeader>
              <CardTitle>
                <Link href={`/posts/${post.slug}`}>{post.title}</Link>
              </CardTitle>
              <CardDescription>{post.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="col-span-1">
        <Input placeholder="搜索" />
      </div>
    </div>
  );
};

export default CategoryPage;
