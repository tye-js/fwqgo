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
      title: "文章",
      url: "/end/posts",
      icon: SquareTerminal,
      isActive: false,
      items: [
        {
          title: "内容生产台",
          url: "/end/ai-rewrite/tasks",
        },
        {
          title: "修改",
          url: "/end/posts/edit",
        },
        {
          title: "草稿箱",
          url: "/end/posts/drafts",
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
          title: "主页",
          url: "/end/seo/",
        },
        {
          title: "分类",
          url: "/end/seo/category/",
        },
        {
          title: "标签",
          url: "/end/seo/tag/",
        },
      ],
    },
    {
      title: "服务器",
      url: "/end/servers/manage",
      icon: Server,
      items: [
        {
          title: "人工修正数据",
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
      ],
    },
    {
      title: "设置",
      url: "/end/settings",
      icon: Settings,
      items: [
        {
          title: "接口配置",
          url: "/end/collect/ai-rewrite",
        },
        {
          title: "生图配置",
          url: "/end/settings/image-generation",
        },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const navItems = data.navMain.map((item) => ({
    ...item,
    isActive:
      item.url === "/end"
        ? pathname === "/end"
        : pathname === item.url ||
          pathname.startsWith(`${item.url}/`) ||
          (item.items ?? []).some(
            (subItem) =>
              pathname === subItem.url || pathname.startsWith(`${subItem.url}/`),
          ),
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
