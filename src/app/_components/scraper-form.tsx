"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { type Tag } from "../end/posts/create/page";
import { scrapeArticleAction, type ScrapeActionState } from "@/app/_actions/scrape";

const initialState: ScrapeActionState = {
  success: false,
  data: null,
  error: null,
};

export function ScraperForm({
  setContent,
  setTitle,
  setDescription,
  setKeywords,
  setRecommendTag,
  setTags,
}: {
  setContent: (content: string) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setKeywords: (keywords: string[]) => void;
  setRecommendTag: (recommendTag: Tag) => void;
  setTags: (tags: Tag[]) => void;
}) {
  const [state, formAction, isPending] = useActionState(
    scrapeArticleAction,
    initialState,
  );

  useEffect(() => {
    if (state.success && state.data) {
      setContent(state.data.htmlContent);
      setTitle(state.data.title);
      setDescription(state.data.description);
      setKeywords(state.data.keywords);
      setRecommendTag({ name: state.data.recommendTagName });
      setTags(state.data.tagsName.map((name: string) => ({ name })));
      toast.success("文章抓取成功");
    } else if (state.error) {
      toast.error("抓取失败：" + state.error);
    }
  }, [state, setContent, setTitle, setDescription, setKeywords, setRecommendTag, setTags]);

  return (
    <div className="mx-auto max-w-4xl p-4">
      <form action={formAction} className="flex gap-2">
        <Input
          type="url"
          name="url"
          placeholder="输入要抓取的网页 URL"
          required
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "抓取中..." : "开始抓取"}
        </Button>
      </form>
    </div>
  );
}
