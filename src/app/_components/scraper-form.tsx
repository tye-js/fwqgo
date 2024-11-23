"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ScrapedArticle {
  title: string;
  content: string;
  description: string;
  htmlContent: string;
  tags: string[];
}

export function ScraperForm({
  setContent,
  setTitle,
  setDescription,
  setTags,
}: {
  setContent: (content: string) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setTags: (tags: { name: string }[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = (await response.json()) as {
        success: boolean;
        data: ScrapedArticle;
        error: string;
      };

      if (!data.success) throw new Error(data.error);

      // setArticle(data.data);
      setContent(data.data.htmlContent);
      setTitle(data.data.title);
      setDescription(data.data.description);
      const tags = data.data.tags.map((tag: string) => ({ name: tag }));
      setTags(tags);
      toast.success("文章抓取成功");
    } catch (error) {
      toast.error("抓取失败：" + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="输入要抓取的网页 URL"
          required
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "抓取中..." : "开始抓取"}
        </Button>
      </form>
    </div>
  );
}
