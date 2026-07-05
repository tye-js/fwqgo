"use client";

import * as React from "react";
import {
  Server,
  Images,
  Globe,
  Settings,
  SquareTerminal,
  LayoutDashboard,
  Megaphone,
  Bot,
} from "lucide-react";

import { BrandMarkIcon } from "@/components/brand/brand-logo";
import { NavMain } from "@/components/endpoint/nav-main";
import { NavUser } from "@/components/endpoint/nav-user";
import { TeamSwitcher } from "@/components/endpoint/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";

const data = {
  user: {
    name: "fwqgo",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  teams: [
    {
      name: "FWQGO",
      logo: BrandMarkIcon,
      plan: "服务器go",
    },
  ],
  navMain: [
    {
      title: "数据面板",
      url: "/",
      icon: LayoutDashboard,
    },
    {
      title: "内容生产",
      url: "/ai-rewrite",
      icon: Bot,
      items: [
        {
          title: "AI生产台",
          url: "/ai-rewrite/tasks",
        },
        {
          title: "AI任务中心",
          url: "/ai-tasks",
        },
        {
          title: "草稿箱",
          url: "/posts/drafts",
        },
      ],
    },
    {
      title: "文章管理",
      url: "/posts",
      icon: SquareTerminal,
      items: [
        {
          title: "文章列表",
          url: "/posts/edit",
        },
        {
          title: "发布质检",
          url: "/posts/quality",
        },
      ],
    },
    {
      title: "媒体中心",
      url: "/images",
      icon: Images,
      items: [
        {
          title: "图片资产",
          url: "/images/list",
        },
        {
          title: "上传图片",
          url: "/images/upload",
        },
        {
          title: "AI生图",
          url: "/images/ai-generate",
        },
        {
          title: "封面生图",
          url: "/images/covers",
        },
      ],
    },

    {
      title: "服务器套餐",
      url: "/servers",
      icon: Server,
      items: [
        {
          title: "套餐看板",
          url: "/servers",
        },
        {
          title: "人工校正",
          url: "/servers/manage",
        },
      ],
    },
    {
      title: "SEO运营",
      url: "/seo",
      icon: Globe,
      items: [
        {
          title: "主页 SEO",
          url: "/seo",
        },
        {
          title: "分类 SEO",
          url: "/seo/category",
        },
        {
          title: "标签 SEO",
          url: "/seo/tag",
        },
      ],
    },
    {
      title: "推广链接",
      url: "/collect",
      icon: Megaphone,
      items: [
        {
          title: "返利商家",
          url: "/collect/aff-man",
        },
        {
          title: "短链跳转",
          url: "/collect/short-links",
        },
        {
          title: "首页推荐",
          url: "/collect/homepage-promoted",
        },
      ],
    },
    {
      title: "系统设置",
      url: "/settings",
      icon: Settings,
      items: [
        {
          title: "AI改写配置",
          url: "/collect/ai-rewrite",
        },
        {
          title: "生图接口配置",
          url: "/settings/image-generation",
        },
      ],
    },
  ],
};

function normalizeNavUrl(url: string) {
  const path = url.split("#")[0]?.split("?")[0] ?? url;
  return path.length > 1 ? path.replace(/\/$/, "") : path;
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const normalizedPathname = normalizeNavUrl(pathname);
  const navItems = data.navMain.map((item) => ({
    ...item,
    isActive: (() => {
      const itemUrl = normalizeNavUrl(item.url);
      const subItems = item.items ?? [];

      if (itemUrl === "/") {
        return normalizedPathname === "/";
      }

      if (subItems.length > 0) {
        return (
          normalizedPathname === itemUrl ||
          subItems.some((subItem) => {
            const subItemUrl = normalizeNavUrl(subItem.url);
            return (
              normalizedPathname === subItemUrl ||
              normalizedPathname.startsWith(`${subItemUrl}/`)
            );
          })
        );
      }

      return (
        normalizedPathname === itemUrl ||
        normalizedPathname.startsWith(`${itemUrl}/`)
      );
    })(),
  }));

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
