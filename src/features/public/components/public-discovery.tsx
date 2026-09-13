import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Cpu,
  Globe2,
  SlidersHorizontal,
} from "lucide-react";

export function PublicDiscovery({
  language = "zh",
  compact = false,
}: {
  language?: "zh" | "en";
  compact?: boolean;
}) {
  const english = language === "en";
  const prefix = english ? "/en" : "";
  const entries = [
    {
      icon: BookOpen,
      title: english ? "Understand the essentials" : "先把基础弄明白",
      description: english
        ? "Read practical explanations of server specifications, IPs and workloads."
        : "读懂配置、IP 与业务场景，了解每个参数意味着什么。",
      href: `${prefix}/knowledge`,
      label: english ? "Knowledge base" : "服务器知识库",
    },
    {
      icon: Globe2,
      title: english ? "Find the right network" : "找到适合的线路",
      description: english
        ? "Start with your users and carriers, then compare network routes."
        : "从用户地区与运营商出发，判断 CN2、CMI 等线路是否适合。",
      href: `${prefix}/tools/network-lines`,
      label: english ? "Network guide" : "线路选择工具",
    },
    {
      icon: Cpu,
      title: english ? "Size your next project" : "给项目选对配置",
      description: english
        ? "Estimate CPU, memory and storage around your actual workload."
        : "结合项目规模，梳理 CPU、内存和存储需求。",
      href: `${prefix}/tools/server-sizing`,
      label: english ? "Sizing tool" : "配置选择工具",
    },
    {
      icon: SlidersHorizontal,
      title: english ? "Compare before you buy" : "把套餐放在一起比",
      description: english
        ? "Filter available plans by budget, location and specifications."
        : "按预算、地区和配置筛选套餐，核对价格与购买条件。",
      href: "/servers",
      label: english ? "Server inventory" : "查看服务器库存",
    },
  ];

  return (
    <nav
      aria-label={english ? "Server buying resources" : "服务器选购资源"}
      className={
        compact ? "grid gap-2" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      }
    >
      {entries.map(({ icon: Icon, ...entry }) => (
        <Link
          key={entry.href}
          href={entry.href}
          className={`group min-w-0 rounded-xl transition-colors hover:border-primary/35 ${compact ? "flex min-h-11 items-center gap-3 border border-transparent p-3 hover:bg-muted" : "public-panel flex flex-col p-5 sm:p-6"}`}
        >
          <span
            className={`flex shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary ${compact ? "size-9" : "mb-5 size-11"}`}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-6 text-foreground group-hover:text-primary">
              {compact ? entry.label : entry.title}
            </span>
            {!compact ? (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {entry.description}
              </p>
            ) : null}
          </div>
          {compact ? (
            <ArrowUpRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          ) : (
            <span className="mt-5 flex items-center justify-between gap-2 text-xs font-semibold text-primary">
              {entry.label}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
