import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type AffiliateRewriteReport } from "@/server/links/affiliate-link-rewriter";

function shortHref(value: string) {
  if (value.length <= 120) {
    return value;
  }

  return `${value.slice(0, 72)}...${value.slice(-36)}`;
}

function affiliateParamLabel(input: {
  affParam?: string | null;
  affValue?: string | null;
  productParam?: string | null;
  productId?: string | null;
  mode?: AffiliateRewriteReport["matchedLinks"][number]["mode"];
}) {
  if (input.mode === "product-param") {
    const name = input.productParam ?? "产品 ID";
    return input.productId ? `${name}=${input.productId}` : name;
  }
  if (!input.affParam) {
    return "-";
  }

  return input.affValue
    ? `${input.affParam}=${input.affValue}`
    : input.affParam;
}

export function AffiliateRewriteAudit({
  report,
  limit = 12,
}: {
  report: AffiliateRewriteReport;
  limit?: number;
}) {
  const matchedLinks = report.matchedLinks.slice(0, limit);
  const missingProductLinks = report.unmatchedLinks.filter(
    (item) => item.reason === "missing-product-id",
  );
  const unmatchedProviderLinks = report.unmatchedLinks.filter(
    (item) => item.reason !== "missing-product-id",
  );
  const unmatchedHosts = [
    ...new Set(unmatchedProviderLinks.map((item) => item.host).filter(Boolean)),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">总链接 {report.totalLinks}</Badge>
        <Badge variant="secondary">命中 {report.matchedLinks.length}</Badge>
        <Badge
          variant={unmatchedProviderLinks.length > 0 ? "secondary" : "outline"}
        >
          无商家 {unmatchedProviderLinks.length}（保留原链）
        </Badge>
        <Badge
          variant={missingProductLinks.length > 0 ? "secondary" : "outline"}
        >
          缺产品 ID {missingProductLinks.length}
        </Badge>
        <Badge
          variant={report.invalidLinks.length > 0 ? "destructive" : "outline"}
        >
          无效 {report.invalidLinks.length}
        </Badge>
        <Badge variant="outline">站内移除 {report.internalLinksRemoved}</Badge>
      </div>

      {matchedLinks.length > 0 ? (
        <div className="overflow-hidden rounded-md border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">命中商家</TableHead>
                <TableHead className="min-w-[180px]">参数 / 模式</TableHead>
                <TableHead className="min-w-[260px]">替换前</TableHead>
                <TableHead className="min-w-[260px]">替换后</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {matchedLinks.map((item, index) => (
                <TableRow
                  key={`${item.finalHref}-${index}`}
                  className="align-top"
                >
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{item.providerName}</p>
                      <p className="break-all text-xs text-muted-foreground">
                        {item.matchedDomain}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant="outline">
                        {affiliateParamLabel(item)}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {item.mode === "replace"
                          ? "href 整条替换"
                          : item.mode === "product-param"
                            ? "按产品 ID 生成"
                            : "只替换返利参数"}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 text-xs">
                      <p className="break-all text-muted-foreground">
                        原始：{shortHref(item.originalHref)}
                      </p>
                      <p className="break-all text-muted-foreground">
                        解析：{shortHref(item.resolvedHref)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="break-all text-xs text-muted-foreground">
                      {shortHref(item.finalHref)}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">暂无命中的返利链接。</p>
      )}

      {report.matchedLinks.length > matchedLinks.length ? (
        <p className="text-xs text-muted-foreground">
          还有 {report.matchedLinks.length - matchedLinks.length}{" "}
          条命中记录未展示。
        </p>
      ) : null}

      {unmatchedHosts.length > 0 ? (
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium">未命中域名</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              这些有效外链没有对应返利商家，系统会保留原 URL，不影响文章发布。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {unmatchedHosts.map((host) => (
              <Badge key={host} variant="outline">
                {host}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {missingProductLinks.length > 0 ? (
        <div className="space-y-2">
          <div>
            <p className="text-sm font-medium">缺少产品 ID</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              已匹配供应商，但原链接和跳转目标都没有 PID/GID。系统保留原
              URL，避免生成指向错误套餐的返利链接。
            </p>
          </div>
          <div className="space-y-1">
            {missingProductLinks.slice(0, limit).map((item, index) => (
              <p
                key={`${item.href}-${index}`}
                className="break-all text-xs text-muted-foreground"
              >
                {shortHref(item.href)}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
