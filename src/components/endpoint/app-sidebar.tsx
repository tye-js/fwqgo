"use client";

import * as React from "react";

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
import {
  cmsNavigation,
  isCmsPathMatch,
} from "@/features/cms/lib/navigation";

const data = {
  user: {
    name: "管理员",
    email: "CMS 管理后台",
  },
  teams: [
    {
      name: "FWQGO",
      logo: BrandMarkIcon,
      plan: "服务器go",
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const navItems = cmsNavigation.map((item) => ({
    ...item,
    items: item.items?.map((subItem) => ({
      ...subItem,
      isActive: isCmsPathMatch(pathname, subItem.url, subItem.matchUrls),
    })),
    isActive:
      isCmsPathMatch(pathname, item.url, item.matchUrls) ||
      item.items?.some((subItem) =>
        isCmsPathMatch(pathname, subItem.url, subItem.matchUrls),
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
