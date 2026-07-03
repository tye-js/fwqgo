"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
    isActive?: boolean;
    items?: {
      title: string;
      url: string;
    }[];
  }[];
}) {
  const pathname = usePathname();
  const normalizeUrl = (url: string) => {
    const path = url.split("#")[0]?.split("?")[0] ?? url;
    return path.length > 1 ? path.replace(/\/$/, "") : path;
  };
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const activeSubItemUrl = items
    .flatMap((item) => item.items ?? [])
    .map((item) => ({
      ...item,
      normalizedUrl: normalizeUrl(item.url),
    }))
    .filter((item) =>
      item.normalizedUrl === "/"
        ? normalizedPathname === "/"
        : normalizedPathname === item.normalizedUrl ||
          normalizedPathname.startsWith(`${item.normalizedUrl}/`),
    )
    .sort((left, right) => right.normalizedUrl.length - left.normalizedUrl.length)[0]
    ?.url;

  return (
    <SidebarGroup className="p-1.5">
      <SidebarGroupLabel className="h-6 px-2 text-[11px] uppercase tracking-wide text-sidebar-foreground/50">
        菜单
      </SidebarGroupLabel>
      <SidebarMenu className="gap-0.5">
        {items.map((item) => (
          <Collapsible
            key={item.title}
            asChild
            defaultOpen={item.isActive}
            className="group/collapsible"
          >
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip={item.title} className="h-8">
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                  <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {item.items?.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton
                        asChild
                        isActive={subItem.url === activeSubItemUrl}
                        size="sm"
                      >
                        <Link href={subItem.url}>
                          <span>{subItem.title}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
