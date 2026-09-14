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
  findCmsNavigationEntry,
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
      plan: "内容管理工作空间",
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const currentEntry = findCmsNavigationEntry(pathname);
  const navItems = cmsNavigation.map((item) => ({
    ...item,
    items: item.items?.map((subItem) => ({
      ...subItem,
      isActive: currentEntry?.url === subItem.url,
    })),
    isActive:
      currentEntry?.url === item.url ||
      item.items?.some((subItem) => currentEntry?.url === subItem.url),
  }));

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:px-1">
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent className="px-2 py-3 group-data-[collapsible=icon]:overflow-auto group-data-[collapsible=icon]:px-0.5">
        <NavMain items={navItems} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:px-1">
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
