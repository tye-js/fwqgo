import Link from "next/link";
import React from "react";

import { getCategories } from "@/app/_actions/category";
import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";
import { navigationMenuTriggerStyle } from "@/components/ui/navigation-menu";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

const HeaderComponent = async () => {
  const { data: categories, error } = await getCategories();
  if (error) return <div>加载失败: {error}</div>;
  if (!categories) return <div>加载中...</div>;

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/90 backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <div className="container mx-auto px-4">
        <div className="flex min-h-[72px] items-center justify-between gap-6">
          <Link href="/" className="min-w-0">
            <BrandLogo className="min-w-0" />
          </Link>

          <NavigationMenu className="hidden lg:block">
            <NavigationMenuList className="rounded-full border border-border/70 bg-white/90 p-1 shadow-sm backdrop-blur">
              {categories.map((category) =>
                category.children.length > 0 ? (
                  <NavigationMenuItem key={category.id}>
                    <NavigationMenuTrigger className="rounded-full">
                      {category.name}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <ul className="grid w-[420px] gap-3 p-4 md:w-[520px] md:grid-cols-2 lg:w-[620px]">
                        {category.children.map((item) => (
                          <ListItem
                            key={item.id}
                            title={item.name}
                            href={`/fwq/${item.slug}/page/1`}
                          >
                            {item.description}
                          </ListItem>
                        ))}
                      </ul>
                    </NavigationMenuContent>
                  </NavigationMenuItem>
                ) : (
                  <NavigationMenuItem key={category.id}>
                    <NavigationMenuLink
                      href={`/fwq/${category.slug}/page/1`}
                      className={cn(
                        navigationMenuTriggerStyle(),
                        "rounded-full bg-transparent",
                      )}
                    >
                      {category.name}
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                ),
              )}
            </NavigationMenuList>
          </NavigationMenu>
        </div>
      </div>
    </header>
  );
};

const ListItem = React.forwardRef<
  React.ComponentRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, href, ...props }, ref) => {
  if (!href) return null;

  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          href={href}
          ref={ref}
          className={cn(
            "block select-none space-y-2 rounded-2xl border border-transparent p-4 leading-none no-underline outline-none transition-colors hover:border-primary/20 hover:bg-primary/5 focus:border-primary/20 focus:bg-primary/5",
            className,
          )}
          {...props}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";

export default HeaderComponent;
