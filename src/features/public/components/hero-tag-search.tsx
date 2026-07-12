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
        搜索服务器套餐、商家、地区和优惠码
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="hero-tag-search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (errorMessage) setErrorMessage("");
            }}
            placeholder="搜索套餐、商家、地区、优惠码，例如：香港 CN2"
            aria-describedby={errorMessage ? "hero-tag-search-error" : undefined}
            aria-invalid={Boolean(errorMessage)}
            className="h-12 rounded-md border-border bg-background pl-10 text-sm shadow-sm"
          />
        </div>
        <Button
          type="submit"
          disabled={isPending}
          className="h-12 rounded-md px-6 text-sm font-medium"
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
