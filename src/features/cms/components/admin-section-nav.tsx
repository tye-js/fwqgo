import Link from "next/link";

import { Button } from "@/components/ui/button";

type AdminSectionNavItem = {
  label: string;
  href: string;
};

export function AdminSectionNav({
  label,
  currentHref,
  items,
}: {
  label: string;
  currentHref: string;
  items: AdminSectionNavItem[];
}) {
  return (
    <nav
      aria-label={label}
      className="flex min-w-0 flex-wrap gap-1 rounded-md border border-border/70 bg-muted/20 p-1"
    >
      {items.map((item) => (
        <Button
          key={item.href}
          asChild
          size="sm"
          variant={currentHref === item.href ? "secondary" : "ghost"}
          className="min-h-10 flex-1 sm:flex-none"
        >
          <Link
            href={item.href}
            aria-current={currentHref === item.href ? "page" : undefined}
          >
            {item.label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}

export const imageGenerationNavItems: AdminSectionNavItem[] = [
  { label: "通用生图", href: "/images/ai-generate" },
  { label: "文章封面", href: "/images/covers" },
];

export const linkManagementNavItems: AdminSectionNavItem[] = [
  { label: "返利商家", href: "/collect/aff-man" },
  { label: "短链跳转", href: "/collect/short-links" },
];

export const seoManagementNavItems: AdminSectionNavItem[] = [
  { label: "主页 SEO", href: "/seo" },
  { label: "分类 SEO", href: "/seo/category" },
  { label: "标签 SEO", href: "/seo/tag" },
];

export const modelSettingsNavItems: AdminSectionNavItem[] = [
  { label: "AI 改写", href: "/collect/ai-rewrite" },
  { label: "生图接口", href: "/settings/image-generation" },
];
