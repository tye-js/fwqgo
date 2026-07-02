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
  ListChecks,
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
      title: "概览",
      url: "/end",
      icon: LayoutDashboard,
      isActive: false,
      items: [
        {
          title: "数据面板",
          url: "/end",
        },
      ],
    },
    {
      title: "内容生产",
      url: "/end/ai-rewrite",
      icon: Bot,
      isActive: false,
      items: [
        {
          title: "生产工作台",
          url: "/end/ai-rewrite/tasks",
        },
        {
          title: "草稿箱",
          url: "/end/posts/drafts",
        },
      ],
    },
    {
      title: "AI任务中心",
      url: "/end/ai-tasks",
      icon: ListChecks,
      isActive: false,
      items: [
        {
          title: "任务看板",
          url: "/end/ai-tasks",
        },
        {
          title: "失败诊断",
          url: "/end/ai-tasks#failed-tasks",
        },
        {
          title: "任务列表",
          url: "/end/ai-tasks#task-table",
        },
      ],
    },
    {
      title: "文章管理",
      url: "/end/posts",
      icon: SquareTerminal,
      isActive: false,
      items: [
        {
          title: "文章列表",
          url: "/end/posts/edit",
        },
        {
          title: "新建文章",
          url: "/end/posts/create",
        },
      ],
    },
    {
      title: "媒体",
      url: "/end/images",
      icon: Images,
      items: [
        {
          title: "上传图片",
          url: "/end/images/upload",
        },
        {
          title: "AI生图",
          url: "/end/images/ai-generate",
        },
        {
          title: "封面生图",
          url: "/end/images/covers",
        },
        {
          title: "图片资产",
          url: "/end/images/list",
        },
      ],
    },

    {
      title: "SEO",
      url: "/end/seo",
      icon: Globe,
      items: [
        {
          title: "主页 SEO",
          url: "/end/seo/",
        },
        {
          title: "分类 SEO",
          url: "/end/seo/category/",
        },
        {
          title: "标签 SEO",
          url: "/end/seo/tag/",
        },
      ],
    },
    {
      title: "服务器",
      url: "/end/servers",
      icon: Server,
      items: [
        {
          title: "套餐提取",
          url: "/end/servers",
        },
        {
          title: "套餐校正",
          url: "/end/servers/manage",
        },
      ],
    },
    {
      title: "推广运营",
      url: "/end/collect",
      icon: Megaphone,
      items: [
        {
          title: "返利设定",
          url: "/end/collect/aff-man",
        },
        {
          title: "首页推荐",
          url: "/end/collect/homepage-promoted",
        },
        {
          title: "短链跳转",
          url: "/end/collect/short-links",
        },
      ],
    },
    {
      title: "设置",
      url: "/end/settings",
      icon: Settings,
      items: [
        {
          title: "生图接口配置",
          url: "/end/settings/image-generation",
        },
        {
          title: "改写接口配置",
          url: "/end/collect/ai-rewrite",
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

      if (itemUrl === "/end") {
        return normalizedPathname === "/end";
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
