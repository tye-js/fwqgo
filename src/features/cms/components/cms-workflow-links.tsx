import Link from "next/link";
import {
  ArrowUpRight,
  FileInput,
  PenLine,
  ShieldCheck,
  LayoutTemplate,
} from "lucide-react";

const steps = [
  {
    title: "采集入稿",
    description: "清洗来源正文，保存完整草稿",
    href: "/ai-rewrite/tasks#single-task",
    icon: FileInput,
  },
  {
    title: "编辑内容",
    description: "维护正文、SEO 和双语版本",
    href: "/posts/drafts",
    icon: PenLine,
  },
  {
    title: "检查发布",
    description: "核对封面、链接与发布质量",
    href: "/posts/quality",
    icon: ShieldCheck,
  },
  {
    title: "安排展示",
    description: "管理首页内容与推广位置",
    href: "/collect/homepage-promoted",
    icon: LayoutTemplate,
  },
];

export function CmsWorkflowLinks() {
  return (
    <nav
      aria-label="内容工作流"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {steps.map(({ icon: Icon, ...step }, index) => (
        <Link
          key={step.href}
          href={step.href}
          className="cms-metric-card group flex min-w-0 items-start gap-3 p-4"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2 text-sm font-semibold">
              <span>{step.title}</span>
              <span className="font-mono text-xs font-normal text-muted-foreground">
                0{index + 1}
              </span>
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {step.description}
            </span>
          </span>
          <ArrowUpRight
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
            aria-hidden="true"
          />
        </Link>
      ))}
    </nav>
  );
}
