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
import { decodeSlug } from "@fwqgo/core/utils";
import {
  cmsBreadcrumbPathHrefs,
  cmsBreadcrumbPathTitles,
  cmsBreadcrumbSegmentTitles,
} from "@/features/cms/lib/navigation";

function formatBreadcrumbTitle(value: string, path: string) {
  return (
    cmsBreadcrumbPathTitles[path] ??
    cmsBreadcrumbSegmentTitles[value] ??
    decodeSlug(value)
  );
}

export default function AppBreadcrumb() {
  const pathname = usePathname();
  const breadcrumbItems = pathname
    .split("/")
    .map((item) => ({
      title: item,
      url: `/${item}`,
    }))
    .filter((item) => item.title !== "");

  if (breadcrumbItems.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList className="min-w-0 flex-nowrap">
          <BreadcrumbItem className="min-w-0">
            <BreadcrumbPage className="max-w-[58vw] truncate text-sm md:max-w-[42vw]">
              数据面板
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList className="min-w-0 flex-nowrap">
        {breadcrumbItems.map((item, index) => {
          const breadcrumbUrl = breadcrumbItems
            .slice(0, index + 1)
            .map((breadcrumbItem) => breadcrumbItem.url)
            .join("");
          if (index === breadcrumbItems.length - 1) {
            return (
              <BreadcrumbItem key={item.title} className="min-w-0">
                <BreadcrumbPage className="max-w-[58vw] truncate text-sm md:max-w-[42vw]">
                  {formatBreadcrumbTitle(item.title, breadcrumbUrl)}
                </BreadcrumbPage>
              </BreadcrumbItem>
            );
          }
          return (
            <Fragment key={breadcrumbUrl}>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink
                  href={cmsBreadcrumbPathHrefs[breadcrumbUrl] ?? breadcrumbUrl}
                >
                  {formatBreadcrumbTitle(item.title, breadcrumbUrl)}
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
