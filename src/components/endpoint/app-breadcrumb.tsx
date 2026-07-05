"use client";

import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react";
import { decodeSlug } from "@fwqgo/core/utils";

const breadcrumbTitleMap: Record<string, string> = {
  "ai-rewrite": "内容生产",
  "ai-tasks": "AI任务中心",
  tasks: "AI生产台",
  collect: "推广链接",
  "aff-man": "返利商家",
  "short-links": "短链跳转",
  "homepage-promoted": "首页推荐",
  images: "媒体中心",
  list: "图片资产",
  upload: "上传图片",
  covers: "封面生图",
  "ai-generate": "AI生图",
  posts: "文章管理",
  drafts: "草稿箱",
  edit: "文章列表",
  post: "编辑文章",
  seo: "SEO运营",
  category: "分类SEO",
  tag: "标签SEO",
  servers: "服务器套餐",
  manage: "人工校正",
  settings: "系统设置",
  "image-generation": "生图接口配置",
};

const breadcrumbPathTitleMap: Record<string, string> = {
  "/collect/ai-rewrite": "AI改写配置",
};

function formatBreadcrumbTitle(value: string, path: string) {
  return (
    breadcrumbPathTitleMap[path] ?? breadcrumbTitleMap[value] ?? decodeSlug(value)
  );
}

export default function AppBreadcrumb() {
  const pathname = usePathname();
  const breadcrumbItems = pathname
    .split("/")
    .map((item) => ({
      title: item,
      url: `/${item}`,
    }))
    .filter((item) => item.title !== "");

  if (breadcrumbItems.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList className="min-w-0 flex-nowrap">
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="max-w-[58vw] truncate text-sm md:max-w-[42vw]">
              数据面板
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList className="min-w-0 flex-nowrap">
        {breadcrumbItems.map((item, index) => {
          const breadcrumbUrl = breadcrumbItems
            .slice(0, index + 1)
            .map((breadcrumbItem) => breadcrumbItem.url)
            .join("");
          if (index === breadcrumbItems.length - 1) {
            return (
              <BreadcrumbItem key={item.title} className="min-w-0">
                <BreadcrumbPage className="max-w-[58vw] truncate text-sm md:max-w-[42vw]">
                  {formatBreadcrumbTitle(item.title, breadcrumbUrl)}
                </BreadcrumbPage>
              </BreadcrumbItem>
            );
          }
          return (
            <Fragment key={item.title}>
              <BreadcrumbItem key={item.title} className="hidden md:block">
                <BreadcrumbLink href={breadcrumbUrl}>
                  {formatBreadcrumbTitle(item.title, breadcrumbUrl)}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
