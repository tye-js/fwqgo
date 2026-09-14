import {
  Bot,
  BookOpen,
  FileText,
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
    title: "工作台",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "内容管理",
    url: "/posts/edit",
    icon: FileText,
    items: [
      { title: "采集入稿", url: "/ai-rewrite/tasks" },
      { title: "草稿箱", url: "/posts/drafts" },
      {
        title: "文章库",
        url: "/posts/edit",
        matchUrls: ["/posts/edit/post"],
      },
      { title: "新建文章", url: "/posts/create" },
      { title: "发布质检", url: "/posts/quality" },
    ],
  },
  {
    title: "任务中心",
    url: "/ai-tasks",
    icon: Bot,
  },
  {
    title: "知识管理",
    url: "/knowledge",
    icon: BookOpen,
    items: [
      { title: "知识条目", url: "/knowledge" },
      { title: "来源资料", url: "/knowledge/sources" },
      { title: "配置规则", url: "/knowledge/server-sizing" },
      { title: "线路经验", url: "/knowledge/network-lines" },
    ],
  },
  {
    title: "服务器套餐",
    url: "/servers/manage",
    icon: Server,
    items: [
      { title: "套餐管理", url: "/servers/manage" },
      { title: "供应商采集", url: "/servers/monitor" },
    ],
  },
  {
    title: "图片媒体",
    url: "/images/list",
    icon: Images,
    items: [
      { title: "图片资产", url: "/images/list" },
      { title: "上传图片", url: "/images/upload" },
      { title: "文章封面", url: "/images/covers" },
      { title: "通用生图", url: "/images/ai-generate" },
    ],
  },
  {
    title: "内容运营",
    url: "/collect/homepage-promoted",
    icon: Megaphone,
    items: [
      { title: "首页运营", url: "/collect/homepage-promoted" },
      { title: "供应商档案", url: "/collect/aff-man" },
      { title: "短链管理", url: "/collect/short-links" },
      { title: "主页 SEO", url: "/seo" },
      { title: "分类 SEO", url: "/seo/category" },
      { title: "标签 SEO", url: "/seo/tag" },
    ],
  },
  {
    title: "接口设置",
    url: "/collect/ai-rewrite",
    icon: Settings,
    items: [
      { title: "AI 服务配置", url: "/collect/ai-rewrite" },
      { title: "生图接口配置", url: "/settings/image-generation" },
    ],
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

export type CmsNavigationEntry = CmsNavigationChild & {
  groupTitle: string;
  icon: LucideIcon;
};

export function getCmsNavigationEntries(query = ""): CmsNavigationEntry[] {
  const entries = cmsNavigation.flatMap((group) =>
    group.items?.length
      ? group.items.map((item) => ({
          ...item,
          groupTitle: group.title,
          icon: group.icon,
        }))
      : [
          {
            title: group.title,
            url: group.url,
            matchUrls: group.matchUrls,
            groupTitle: "工作空间",
            icon: group.icon,
          },
        ],
  );
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const searchable =
      `${entry.title} ${entry.groupTitle} ${entry.url}`.toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

export function findCmsNavigationEntry(pathname: string) {
  let selected: CmsNavigationEntry | undefined;
  let bestLength = -1;
  for (const entry of getCmsNavigationEntries()) {
    for (const candidate of [entry.url, ...(entry.matchUrls ?? [])]) {
      const length = normalizeCmsPath(candidate).length;
      if (isCmsPathMatch(pathname, candidate) && length > bestLength) {
        selected = entry;
        bestLength = length;
      }
    }
  }
  return selected;
}

export const cmsBreadcrumbSegmentTitles: Record<string, string> = {
  "ai-rewrite": "内容",
  "ai-tasks": "AI 任务中心",
  knowledge: "服务器知识库",
  sources: "来源工作台",
  "server-sizing": "配置规则工作台",
  "network-lines": "线路经验工作台",
  tasks: "文章生产台",
  collect: "运营",
  "aff-man": "供应商档案",
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
  "/collect/ai-rewrite": "AI 服务配置",
  "/ai-rewrite/tasks": "采集入稿",
  "/posts/create": "新建文章",
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
