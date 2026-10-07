"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function HeroTagSearch({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setErrorMessage("请输入关键词，例如：香港 CN2、RackNerd、优惠码。");
      return;
    }

    setIsPending(true);
    setErrorMessage("");

    const searchHref = `/search?q=${encodeURIComponent(normalizedQuery)}`;

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

      router.push(searchHref);
    } catch {
      router.push(searchHref);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Label htmlFor="hero-tag-search" className="sr-only">
        搜索商家、地区、线路或文章
      </Label>
      <div
        className={compact ? "flex gap-2" : "flex flex-col gap-2 sm:flex-row"}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="hero-tag-search"
            type="search"
            name="q"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (errorMessage) setErrorMessage("");
            }}
            placeholder="搜索商家、地区、线路或文章"
            aria-describedby={
              errorMessage ? "hero-tag-search-error" : undefined
            }
            aria-invalid={Boolean(errorMessage)}
            className={
              compact
                ? "h-11 rounded-lg border-border bg-card pl-10 text-base"
                : "h-14 rounded-xl border-border bg-card pl-10 text-base shadow-sm"
            }
          />
        </div>
        <Button
          type="submit"
          disabled={isPending}
          className={
            compact
              ? "h-11 shrink-0 rounded-lg px-4 text-sm font-medium"
              : "h-14 rounded-xl px-6 text-sm font-medium"
          }
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
  );
}
