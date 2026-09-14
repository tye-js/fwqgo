"use client";

import * as React from "react";
import Link from "next/link";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function TeamSwitcher({
  teams,
}: {
  teams: {
    name: string;
    logo: React.ElementType;
    plan: string;
  }[];
}) {
  const [activeTeam] = React.useState(teams[0]);
  const { isMobile, setOpenMobile } = useSidebar();
  const teamName = activeTeam?.name ?? "FWQGO";
  const teamPlan = activeTeam?.plan ?? "服务器go";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          size="default"
          className="h-12 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center"
        >
          <Link
            href="/"
            aria-label="FWQGO 工作台"
            onClick={() => {
              if (isMobile) setOpenMobile(false);
            }}
          >
            <div className="flex aspect-square size-9 shrink-0 items-center justify-center rounded-lg text-sidebar-primary-foreground group-data-[collapsible=icon]:size-6">
              {activeTeam && (
                <activeTeam.logo className="size-9 group-data-[collapsible=icon]:size-6" />
              )}
            </div>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold">{teamName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {teamPlan}
              </span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
