"use client";

import * as React from "react";

import { cn } from "@fwqgo/core/utils";

type TableProps = React.TableHTMLAttributes<HTMLTableElement> & {
  mobileLabels?: string[];
  viewportLabel?: string;
};

const TableMobileLabelsContext = React.createContext<string[]>([]);

function textContent(value: React.ReactNode): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textContent).join(" ");
  }
  if (React.isValidElement<{ children?: React.ReactNode }>(value)) {
    return textContent(value.props.children);
  }
  return "";
}

function inferMobileLabels(children: React.ReactNode): string[] {
  const header = React.Children.toArray(children).find(
    (child) =>
      React.isValidElement(child) &&
      child.type === TableHeader,
  );
  if (!React.isValidElement<{ children?: React.ReactNode }>(header)) {
    return [];
  }
  const row = React.Children.toArray(header.props.children).find(
    (child) => React.isValidElement(child) && child.type === TableRow,
  );
  if (!React.isValidElement<{ children?: React.ReactNode }>(row)) {
    return [];
  }
  return React.Children.toArray(row.props.children)
    .filter(
      (child): child is React.ReactElement<{ children?: React.ReactNode }> =>
        React.isValidElement(child) && child.type === TableHead,
    )
    .map((child) => textContent(child.props.children).trim());
}

const TableViewport = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "cms-table-viewport relative w-full max-w-full overflow-auto overscroll-contain",
      className,
    )}
    {...props}
  />
));
TableViewport.displayName = "TableViewport";

const Table = React.forwardRef<
  HTMLTableElement,
  TableProps
>(({ className, children, mobileLabels = [], viewportLabel, ...props }, forwardedRef) => {
  const resolvedMobileLabels = mobileLabels.length
    ? mobileLabels
    : inferMobileLabels(children);
  const tableRef = React.useRef<HTMLTableElement | null>(null);

  const setTableRef = React.useCallback(
    (node: HTMLTableElement | null) => {
      tableRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef],
  );

  React.useLayoutEffect(() => {
    if (!className?.includes("cms-mobile-sticky-actions")) return;
    const table = tableRef.current;
    const headerRow = table?.tHead?.rows.item(0);
    if (!table || !headerRow) return;

    const labels = Array.from(headerRow.cells).map((cell) =>
      (cell.textContent ?? "").replace(/\s+/g, " ").trim(),
    );

    for (const row of Array.from(table.tBodies).flatMap((body) =>
      Array.from(body.rows),
    )) {
      let columnIndex = 0;
      for (const cell of Array.from(row.cells)) {
        const span = Math.max(cell.colSpan || 1, 1);
        if (span === 1 && !cell.hasAttribute("data-mobile-label")) {
          cell.setAttribute("data-mobile-label", labels[columnIndex] ?? "");
        }
        columnIndex += span;
      }
    }
  }, [children, className]);

  return (
    <TableViewport role="region" aria-label={viewportLabel ?? "数据列表或表格"} tabIndex={0}>
      <TableMobileLabelsContext.Provider value={resolvedMobileLabels}>
        <table
          ref={setTableRef}
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        >
          {children}
        </table>
      </TableMobileLabelsContext.Provider>
    </TableViewport>
  );
});
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className,
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <TableRowWithLabels
    ref={ref}
    className={className}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableRowWithLabels = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, children, ...props }, ref) => {
  const labels = React.useContext(TableMobileLabelsContext);
  let columnIndex = 0;
  const labeledChildren = React.Children.map(children, (child) => {
    if (!React.isValidElement<
      React.TdHTMLAttributes<HTMLTableCellElement> & {
        "data-mobile-label"?: string;
      }
    >(child)) {
      return child;
    }
    const span = Math.max(Number(child.props.colSpan) || 1, 1);
    const label = labels[columnIndex];
    columnIndex += span;
    if (child.type !== TableCell || !label || child.props["data-mobile-label"]) {
      return child;
    }
    return React.cloneElement(child, { "data-mobile-label": label });
  });

  return (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    >
      {labeledChildren}
    </tr>
  );
});
TableRowWithLabels.displayName = "TableRowWithLabels";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className,
    )}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableViewport,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
