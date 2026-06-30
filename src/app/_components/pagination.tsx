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
import { cn } from "@/lib/utils";
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
  const paginationItems = getPaginationItems(pageNo, totalPage);

  if (totalPage <= 1) {
    return null;
  }

  const getHref = (page: number) => {
    if (basePath) {
      return `${basePath}/page/${page}`;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set(queryParam, String(page));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            aria-disabled={pageNo === 1}
            className={cn(pageNo === 1 && "hidden")}
            href={getHref(pageNo - 1)}
          />
        </PaginationItem>
        {paginationItems.map((item, index) => (
          <PaginationItem key={`${item}-${index}`}>
            {item === "ellipsis" ? (
              <PaginationEllipsis />
            ) : (
              <PaginationLink href={getHref(item)} isActive={item === pageNo}>
                {item}
              </PaginationLink>
            )}
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext
            aria-disabled={pageNo === totalPage}
            className={cn(pageNo === totalPage && "hidden")}
            href={getHref(pageNo + 1)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
