"use client";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@fwqgo/core/utils";
import { usePathname, useSearchParams } from "next/navigation";

type PaginationItemValue = number | "ellipsis";

function getPaginationItems(pageNo: number, totalPage: number) {
  if (totalPage <= 7) {
    return Array.from({ length: totalPage }, (_, index) => index + 1);
  }

  const pages = new Set<number>([
    1,
    2,
    totalPage - 1,
    totalPage,
    pageNo - 1,
    pageNo,
    pageNo + 1,
  ]);

  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPage)
    .sort((left, right) => left - right);

  const items: PaginationItemValue[] = [];

  for (const page of sortedPages) {
    const previousPage = items.at(-1);

    if (typeof previousPage === "number" && page - previousPage > 1) {
      items.push("ellipsis");
    }

    items.push(page);
  }

  return items;
}

export function PaginationComponent({
  pageNo,
  totalPage,
  basePath,
  queryParam = "pageNo",
}: {
  pageNo: number;
  totalPage: number;
  basePath?: string;
  queryParam?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const normalizedTotalPage = Math.max(Math.floor(totalPage), 0);

  if (normalizedTotalPage <= 1) {
    return null;
  }

  const currentPage = Math.min(Math.max(pageNo, 1), normalizedTotalPage);
  const paginationItems = getPaginationItems(currentPage, normalizedTotalPage);

  const getHref = (page: number) => {
    if (basePath) {
      return `${basePath}/page/${page}`;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set(queryParam, String(page));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <Pagination
      className="justify-start overflow-x-auto py-1 sm:justify-center"
      aria-label={`分页导航，当前第 ${currentPage} 页，共 ${normalizedTotalPage} 页`}
    >
      <PaginationContent className="min-w-max flex-nowrap">
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={currentPage === 1}
            className={cn(
              "min-w-11 px-2 sm:px-4 [&>span]:hidden sm:[&>span]:inline",
              currentPage === 1 && "pointer-events-none opacity-45",
            )}
            href={currentPage === 1 ? undefined : getHref(currentPage - 1)}
          />
        </PaginationItem>
        {paginationItems.map((item, index) => (
          <PaginationItem key={`${item}-${index}`}>
            {item === "ellipsis" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink
                href={getHref(item)}
                isActive={item === currentPage}
                className="min-w-11"
              >
                {item}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            aria-disabled={currentPage === normalizedTotalPage}
            className={cn(
              "min-w-11 px-2 sm:px-4 [&>span]:hidden sm:[&>span]:inline",
              currentPage === normalizedTotalPage &&
                "pointer-events-none opacity-45",
            )}
            href={
              currentPage === normalizedTotalPage
                ? undefined
                : getHref(currentPage + 1)
            }
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
