"use client";

import * as React from "react";
import {
  Images,
  Globe,
  DatabaseZap,
  SquareTerminal,
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
      title: "文章",
      url: "/end/posts",
      icon: SquareTerminal,
      isActive: false,
      items: [
        {
          title: "新建",
          url: "/end/posts/create",
        },
        {
          title: "修改",
          url: "/end/posts/edit",
        },
      ],
    },
    {
      title: "图片",
      url: "/end/images",
      icon: Images,
      items: [
        {
          title: "查看",
          url: "/end/images/list",
        },
        {
          title: "Explorer",
          url: "#",
        },
        {
          title: "Quantum",
          url: "#",
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
      title: "采集",
      url: "/end/collect",
      icon: DatabaseZap,
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
          title: "分类",
          url: "#",
        },
        {
          title: "标签",
          url: "#",
        },
      ],
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  data.navMain.forEach((item) => {
    item.isActive = pathname.startsWith(item.url);
  });
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
