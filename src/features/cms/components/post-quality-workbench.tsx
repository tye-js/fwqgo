import Link from "next/link";
import { ExternalLink, FileWarning, Languages } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  PostQualityIssueFilter,
  PostQualityReport,
} from "@/features/cms/data/post-quality";
import type { PostLanguageFilter } from "@/features/cms/data/post";
import { PostAffiliateReviewActions } from "@/features/cms/components/post-affiliate-review-actions";

const languageFilters: Array<{ value: PostLanguageFilter; label: string }> = [
  { value: "all", label: "全部语言" },
  { value: "zh", label: "中文" },
  { value: "en", label: "英文" },
];

const issueFilters: Array<{ value: PostQualityIssueFilter; label: string }> = [
  { value: "all", label: "全部问题" },
  { value: "seo", label: "SEO缺失" },
  { value: "cover", label: "无封面" },
  { value: "cover_language", label: "封面语言" },
  { value: "relation", label: "中英关系" },
  { value: "affiliate", label: "返利审核" },
  { value: "offers", label: "无套餐" },
];

function buildQualityHref(input: {
  language: PostLanguageFilter;
  issue: PostQualityIssueFilter;
}) {
  const params = new URLSearchParams();

  if (input.language !== "all") {
    params.set("language", input.language);
  }

  if (input.issue !== "all") {
    params.set("issue", input.issue);
  }

  const query = params.toString();
  return query ? `/posts/quality?${query}` : "/posts/quality";
}

function formatTime(value: string | null) {
  if (!value) return "未记录";

  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function languageLabel(value: "zh" | "en") {
  return value === "en" ? "英文" : "中文";
}

function publishLabel(value: boolean) {
  return value ? "已发布" : "草稿";
}

function affiliateStatusLabel(value: string) {
  if (value === "passed") return "已通过";
  if (value === "pending") return "待检查";
  if (value === "manual_required") return "待人工确认";
  return value;
}

export function PostQualityWorkbench({
  report,
}: {
  report: PostQualityReport;
}) {
  const { language, issue } = report.filters;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-muted/20 p-3">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">语言</p>
          <div className="flex flex-wrap gap-2">
            {languageFilters.map((item) => (
              <Button
                key={item.value}
                asChild
                size="sm"
                variant={language === item.value ? "default" : "outline"}
              >
                <Link href={buildQualityHref({ language: item.value, issue })}>
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">问题类型</p>
          <div className="flex flex-wrap gap-2">
            {issueFilters.map((item) => (
              <Button
                key={item.value}
                asChild
                size="sm"
                variant={issue === item.value ? "default" : "outline"}
              >
                <Link href={buildQualityHref({ language, issue: item.value })}>
                  {item.label}
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {report.rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-background p-6 text-center">
          <FileWarning className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">当前筛选下没有质检问题</p>
          <p className="mt-1 text-xs text-muted-foreground">
            可以切换语言或问题类型继续检查最近文章。
          </p>
        </div>
      ) : (
        <Table className="min-w-[1120px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">文章</TableHead>
              <TableHead className="w-[210px]">质检问题</TableHead>
              <TableHead className="w-[190px]">中英文关系</TableHead>
              <TableHead className="w-[260px]">封面</TableHead>
              <TableHead className="w-[220px]">返利/套餐</TableHead>
              <TableHead className="w-[120px]">更新时间</TableHead>
              <TableHead className="w-[130px] text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.map((post) => (
              <TableRow key={post.id}>
                <TableCell>
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {languageLabel(post.language)}
                      </Badge>
                      <Badge variant={post.published ? "default" : "secondary"}>
                        {publishLabel(post.published)}
                      </Badge>
                      {post.categoryName ? (
                        <Badge variant="outline">{post.categoryName}</Badge>
                      ) : null}
                    </div>
                    <div>
                      <p className="line-clamp-2 text-sm font-medium leading-5">
                        {post.title}
                      </p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {post.slug}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {post.issues.length > 0 ? (
                      post.issues.map((item) => (
                        <Badge
                          key={`${post.id}-${item.code}`}
                          title={item.detail}
                          variant={
                            item.severity === "blocker"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {item.label}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">通过</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {post.relatedPost ? (
                    <Link
                      href={`/posts/edit/post/${encodeURIComponent(post.relatedPost.slug)}`}
                      className="group flex min-h-11 items-start gap-2 rounded-md border border-border/70 px-3 py-2 text-sm hover:bg-muted/40"
                    >
                      <Languages className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          对应{languageLabel(post.relatedPost.language)}
                        </span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {post.relatedPost.title}
                        </span>
                      </span>
                      <ExternalLink className="mt-0.5 size-4 shrink-0 opacity-60 group-hover:opacity-100" />
                    </Link>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {post.language === "en"
                        ? "没有绑定中文来源"
                        : "没有对应英文文章"}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  {post.imgUrl ? (
                    <p className="line-clamp-3 break-all text-xs leading-5 text-muted-foreground">
                      {post.imgUrl}
                    </p>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      未设置
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-2">
                    <Badge
                      variant={
                        post.affiliateReviewStatus === "passed"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      返利 {affiliateStatusLabel(post.affiliateReviewStatus)}
                    </Badge>
                    <p className="text-xs leading-5 text-muted-foreground">
                      命中 {post.affiliateReview.matchedCount} · 未命中{" "}
                      {post.affiliateReview.unmatchedCount} · 无效{" "}
                      {post.affiliateReview.invalidCount}
                    </p>
                    {post.affiliateReview.manuallyApproved ? (
                      <Badge variant="outline">已人工确认</Badge>
                    ) : null}
                    <p className="text-xs text-muted-foreground">
                      套餐 {post.offerCount.toLocaleString("zh-CN")}
                    </p>
                    <PostAffiliateReviewActions
                      postId={post.id}
                      postTitle={post.title}
                      status={post.affiliateReviewStatus}
                    />
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatTime(post.updatedAt ?? post.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/posts/edit/post/${encodeURIComponent(post.slug)}`}
                      >
                        编辑
                      </Link>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
