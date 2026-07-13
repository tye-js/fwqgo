import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { type AffiliateRewriteReport } from "@fwqgo/scrape/affiliate-link-rewriter";

function shortHref(value: string) {
  if (value.length <= 120) {
    return value;
  }

  return `${value.slice(0, 72)}...${value.slice(-36)}`;
}

function affiliateParamLabel(input: {
  affParam?: string | null;
  affValue?: string | null;
}) {
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
  const unmatchedHosts = [
    ...new Set(report.unmatchedLinks.map((item) => item.host).filter(Boolean)),
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">总链接 {report.totalLinks}</Badge>
        <Badge variant="secondary">命中 {report.matchedLinks.length}</Badge>
        <Badge
          variant={report.unmatchedLinks.length > 0 ? "secondary" : "outline"}
        >
          未命中 {report.unmatchedLinks.length}（保留原链）
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
    </div>
  );
}
