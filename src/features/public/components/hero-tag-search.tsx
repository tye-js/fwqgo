"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function HeroTagSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setErrorMessage("请输入标签关键词。");
      return;
    }

    setIsPending(true);
    setErrorMessage("");

    try {
      const response = await fetch(
        `/api/tags/search?q=${encodeURIComponent(normalizedQuery)}`,
        {
          method: "GET",
          cache: "no-store",
        },
      );

      const result = (await response.json()) as {
        found?: boolean;
        slug?: string;
      };

      if (response.ok && result.found && result.slug) {
        router.push(`/fwq/tags/${encodeURIComponent(result.slug)}/page/1`);
        return;
      }

      setErrorMessage("没有找到对应标签，试试换个地区、线路、品牌或用途词。");
    } catch {
      setErrorMessage("搜索暂时不可用，请稍后重试。");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-border/70 bg-background/85 p-3 shadow-sm backdrop-blur md:p-4">
      <form onSubmit={handleSubmit} className="space-y-2.5">
        <Label htmlFor="hero-tag-search" className="text-sm">
          搜索服务器标签
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="hero-tag-search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (errorMessage) setErrorMessage("");
              }}
              placeholder="搜索标签，例如：香港 CN2 / 原生IP / RackNerd"
              aria-describedby={errorMessage ? "hero-tag-search-error" : undefined}
              aria-invalid={Boolean(errorMessage)}
              className="min-h-11 rounded-md border-border/70 bg-background pl-11"
            />
          </div>
          <Button
            type="submit"
            disabled={isPending}
            className="min-h-11 rounded-md px-5"
          >
            {isPending ? "搜索中..." : "搜索"}
          </Button>
        </div>

        {errorMessage ? (
          <p id="hero-tag-search-error" className="text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}
      </form>
    </div>
  );
}
