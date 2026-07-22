import {
  Bot,
  Images,
  LayoutDashboard,
  Megaphone,
  Server,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type CmsNavigationChild = {
  title: string;
  url: string;
  matchUrls?: string[];
};

export type CmsNavigationItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  matchUrls?: string[];
  items?: CmsNavigationChild[];
};

export const cmsNavigation: CmsNavigationItem[] = [
  {
    title: "概览",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "内容",
    url: "/ai-rewrite/tasks",
    icon: Bot,
    items: [
      { title: "AI 生产台", url: "/ai-rewrite/tasks" },
      {
        title: "文章库",
        url: "/posts/edit",
        matchUrls: ["/posts/drafts", "/posts/create", "/posts/edit/post"],
      },
      { title: "AI 任务中心", url: "/ai-tasks" },
      { title: "发布质检", url: "/posts/quality" },
    ],
  },
  {
    title: "套餐",
    url: "/servers/manage",
    icon: Server,
    items: [
      { title: "套餐管理", url: "/servers/manage" },
      { title: "供应商采集", url: "/servers/monitor" },
    ],
  },
  {
    title: "媒体",
    url: "/images/list",
    icon: Images,
    items: [
      {
        title: "图片资产",
        url: "/images/list",
        matchUrls: ["/images/upload"],
      },
      {
        title: "AI 生图",
        url: "/images/ai-generate",
        matchUrls: ["/images/covers"],
      },
    ],
  },
  {
    title: "运营",
    url: "/collect/homepage-promoted",
    icon: Megaphone,
    items: [
      { title: "首页运营", url: "/collect/homepage-promoted" },
      {
        title: "链接管理",
        url: "/collect/aff-man",
        matchUrls: ["/collect/short-links"],
      },
      {
        title: "SEO 管理",
        url: "/seo",
        matchUrls: ["/seo/category", "/seo/tag"],
      },
    ],
  },
  {
    title: "模型与接口",
    url: "/collect/ai-rewrite",
    icon: Settings,
    matchUrls: ["/settings/image-generation"],
  },
];

export function normalizeCmsPath(value: string) {
  const path = value.split("#")[0]?.split("?")[0] ?? value;
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

export function isCmsPathMatch(
  pathname: string,
  url: string,
  matchUrls: string[] = [],
) {
  const normalizedPathname = normalizeCmsPath(pathname);
  const candidates = [url, ...matchUrls].map(normalizeCmsPath);

  return candidates.some((candidate) =>
    candidate === "/"
      ? normalizedPathname === "/"
      : normalizedPathname === candidate ||
        normalizedPathname.startsWith(`${candidate}/`),
  );
}

export const cmsBreadcrumbSegmentTitles: Record<string, string> = {
  "ai-rewrite": "内容",
  "ai-tasks": "AI 任务中心",
  tasks: "AI 生产台",
  collect: "运营",
  "aff-man": "返利商家",
  "short-links": "短链跳转",
  "homepage-promoted": "首页运营",
  images: "媒体",
  list: "图片资产",
  upload: "上传图片",
  covers: "封面生图",
  "ai-generate": "AI 生图",
  posts: "文章库",
  drafts: "草稿",
  edit: "文章列表",
  quality: "发布质检",
  post: "编辑文章",
  seo: "SEO 管理",
  category: "分类 SEO",
  tag: "标签 SEO",
  servers: "套餐",
  monitor: "供应商采集",
  manage: "套餐管理",
  settings: "模型与接口",
  "image-generation": "生图接口",
};

export const cmsBreadcrumbPathTitles: Record<string, string> = {
  "/collect/ai-rewrite": "AI 改写配置",
};

export const cmsBreadcrumbPathHrefs: Record<string, string> = {
  "/ai-rewrite": "/ai-rewrite/tasks",
  "/posts": "/posts/edit",
  "/posts/edit/post": "/posts/edit",
  "/images": "/images/list",
  "/collect": "/collect/homepage-promoted",
  "/settings": "/collect/ai-rewrite",
  "/ai-tasks/covers": "/ai-tasks?type=cover",
};
