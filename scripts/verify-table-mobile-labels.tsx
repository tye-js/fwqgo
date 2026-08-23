import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const html = renderToStaticMarkup(
  <Table className="cms-mobile-sticky-actions">
    <TableHeader>
      <TableRow>
        <TableHead>来源</TableHead>
        <TableHead>状态</TableHead>
        <TableHead>操作</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>https://example.com/very-long-source</TableCell>
        <TableCell>成功</TableCell>
        <TableCell>查看</TableCell>
      </TableRow>
    </TableBody>
  </Table>,
);

assert.match(html, /data-mobile-label="来源"/);
assert.match(html, /data-mobile-label="状态"/);
assert.match(html, /data-mobile-label="操作"/);

console.log("Table mobile labels verified in server-rendered HTML before hydration.");
