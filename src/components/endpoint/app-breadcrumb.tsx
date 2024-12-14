"use client";

import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Fragment } from "react";
import { decodeSlug } from "@/lib/utils";

export default function AppBreadcrumb() {
  const pathname = usePathname();
  const breadcrumbItems = pathname
    .split("/")
    .map((item) => ({
      title: item,
      url: `/${item}`,
    }))
    .filter((item) => item.title !== "");
  let breadcrumbUrl = "";
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbItems.map((item, index) => {
          breadcrumbUrl = breadcrumbUrl + item.url;
          if (index === breadcrumbItems.length - 1) {
            return (
              <BreadcrumbItem key={item.title} className="hidden md:block">
                <BreadcrumbPage>{decodeSlug(item.title)}</BreadcrumbPage>
              </BreadcrumbItem>
            );
          }
          return (
            <Fragment key={item.title}>
              <BreadcrumbItem key={item.title} className="hidden md:block">
                <BreadcrumbLink href={breadcrumbUrl}>
                  {decodeSlug(item.title)}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
