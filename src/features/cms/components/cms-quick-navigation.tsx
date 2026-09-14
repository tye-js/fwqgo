"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, Search, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getCmsNavigationEntries } from "@/features/cms/lib/navigation";

export function CmsQuickNavigation() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const resultId = useId();
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const entries = getCmsNavigationEntries(query);

  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) setQuery("");
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.repeat &&
        !event.isComposing &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setOpen((current) => !current);
        setQuery("");
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-2 rounded-lg bg-background text-muted-foreground md:w-56 md:justify-start"
          aria-label="搜索后台页面"
        >
          <Search className="size-4" aria-hidden="true" />
          <span className="hidden md:inline">搜索页面</span>
          <kbd className="ml-auto hidden rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-normal md:inline">
            ⌘ / Ctrl K
          </kbd>
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-4 rounded-xl bg-card sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>快速前往</DialogTitle>
          <DialogDescription>
            输入页面名称，例如草稿、套餐、封面或 SEO。
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-3.5 size-5 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="搜索后台页面名称"
            aria-controls={resultId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                firstLinkRef.current?.focus();
              }
              if (event.key === "Enter") {
                event.preventDefault();
                firstLinkRef.current?.click();
              }
            }}
            maxLength={100}
            autoComplete="off"
            placeholder="搜索工作台中的页面…"
            className="h-12 rounded-lg pl-11 text-base"
          />
        </div>
        <p className="text-xs text-muted-foreground" role="status">
          {entries.length > 0
            ? `找到 ${entries.length} 个页面`
            : "没有匹配的页面，请尝试更短的关键词。"}
        </p>
        <ul
          id={resultId}
          aria-label="页面搜索结果"
          className="max-h-[min(55dvh,420px)] min-w-0 space-y-1 overflow-y-auto overscroll-contain"
        >
          {entries.map((entry, index) => {
            const Icon = entry.icon;
            return (
              <li key={entry.url}>
                <Link
                  ref={index === 0 ? firstLinkRef : undefined}
                  href={entry.url}
                  onClick={() => changeOpen(false)}
                  className="group flex min-h-14 items-center gap-3 rounded-lg px-3 py-2.5 outline-none hover:bg-muted focus-visible:bg-muted"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/5 text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {entry.title}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.groupTitle}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
          {entries.length === 0 ? (
            <li className="py-9 text-center text-muted-foreground">
              <SearchX className="mx-auto size-7" aria-hidden="true" />
              <p className="mt-3 text-sm">也可以从左侧分区导航进入。</p>
            </li>
          ) : null}
        </ul>
        <p className="border-t border-border pt-3 text-xs text-muted-foreground">
          Enter 打开首项 · ↓ 进入结果 · Tab 切换 · Esc 关闭
        </p>
      </DialogContent>
    </Dialog>
  );
}
