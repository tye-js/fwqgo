import Link from "next/link";
import React from "react";
import { navigationMenuTriggerStyle } from "@/components/ui/navigation-menu";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuContent,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import { getCategories } from "@/app/_actions/category";
const HeaderComponent = async () => {
  const { data: categories, error } = await getCategories();
  if (error) return <div>加载失败: {error}</div>;
  if (!categories) return <div>加载中...</div>;
  return (
    <header className="sticky top-0 z-50 h-14 w-full bg-background">
      <div className="container mx-auto flex h-full items-center justify-between px-4 text-center">
        <h2 className="text-xl font-bold text-neutral-900">
          <Link href={"/"}>服务器go</Link>
        </h2>
        <NavigationMenu className="hidden lg:block">
          <NavigationMenuList className="gap-2 lg:gap-6">
            {categories.map((category) =>
              !!category.children.length ? (
                <NavigationMenuItem key={category.id}>
                  <NavigationMenuTrigger>{category.name}</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                      {category.children.map((item) => (
                        <ListItem
                          key={item.id}
                          title={item.name}
                          href={"/fwq/" + item.slug}
                        >
                          {item.description}
                        </ListItem>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              ) : (
                <NavigationMenuItem key={category.id}>
                  <Link href={"/fwq/" + category.slug} legacyBehavior passHref>
                    <NavigationMenuLink
                      className={navigationMenuTriggerStyle()}
                    >
                      {category.name}
                    </NavigationMenuLink>
                  </Link>
                </NavigationMenuItem>
              ),
            )}
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </header>
  );
};

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
            className,
          )}
          {...props}
        >
          <div className="text-sm font-medium leading-none">{title}</div>
          <p className="line-clamp-2 text-sm leading-snug">{children}</p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";

export default HeaderComponent;
