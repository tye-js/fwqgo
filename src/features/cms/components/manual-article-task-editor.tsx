"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";

import { DEFAULT_ARTICLE_COVER } from "@fwqgo/core/article-cover";
import { saveManualArticleTaskAction } from "@/features/cms/actions/manual-article";
import { AdminSectionCard } from "@/features/cms/components/admin-page-shell";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArticleTextInput } from "@/features/cms/components/article-text-input";

export function ManualArticleTaskEditor({
  taskId,
  expectedUpdatedAt,
  sourceMarkdown,
  language,
}: {
  taskId: number;
  expectedUpdatedAt: string;
  sourceMarkdown: string;
  language: "zh" | "en";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const formData = new FormData(event.currentTarget);
    const rawTagNames = formData.get("tagNames");
    const tagNames = typeof rawTagNames === "string" ? rawTagNames : "";
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveManualArticleTaskAction({
          taskId,
          expectedUpdatedAt,
          title: formData.get("title"),
          slug: formData.get("slug"),
          description: formData.get("description"),
          keywords: formData.get("keywords"),
          content,
          tagNames: [
            ...new Set(
              tagNames
                .split(/[,，\n]/)
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ],
        });
        if (result.error || !result.data) {
          const message = result.error ?? "保存失败，请稍后重试";
          setError(message);
          toast.error(message);
          return;
        }
        toast.success("人工正文和 SEO 已保存为草稿", {
          description: result.data.warnings.length
            ? result.data.warnings.join("；")
            : "已使用默认封面，可在文章编辑页点击“生成封面图”。",
        });
        router.push(`/posts/edit/post/${encodeURIComponent(result.data.slug)}`);
        router.refresh();
      } catch {
        const message = "保存请求未完成，请保留当前输入并刷新任务状态确认结果";
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <AdminSectionCard
      title={
        language === "en" ? "人工填写英文正文与 SEO" : "人工填写正文与 SEO"
      }
      description="填写或粘贴整理好的内容，保存后进入草稿箱。标题、slug、摘要、关键词和标签均由人工提供。"
    >
      <form
        onSubmit={submit}
        className="min-w-0 space-y-5"
        aria-label="人工文章编辑"
      >
        <fieldset disabled={isPending} className="min-w-0 space-y-5">
          <div className="grid min-w-0 gap-4 lg:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="manual-article-title">文章标题 / SEO 标题</Label>
              <ArticleTextInput
                id="manual-article-title"
                name="title"
                required
                maxLength={300}
                className="min-h-20"
                placeholder={
                  language === "en" ? "输入英文标题" : "输入文章标题"
                }
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="manual-article-slug">文章 URL（slug）</Label>
              <ArticleTextInput
                id="manual-article-slug"
                name="slug"
                required
                maxLength={320}
                className="min-h-20 break-all"
                placeholder="article-url-slug"
                autoCapitalize="none"
                spellCheck={false}
              />
            </div>
            <div className="min-w-0 space-y-2 lg:col-span-2">
              <Label htmlFor="manual-article-description">SEO 摘要</Label>
              <Textarea
                id="manual-article-description"
                name="description"
                required
                maxLength={800}
                className="min-h-28"
                placeholder={
                  language === "en" ? "输入英文摘要" : "输入文章摘要"
                }
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="manual-article-keywords">SEO 关键词</Label>
              <Input
                id="manual-article-keywords"
                name="keywords"
                maxLength={800}
                className="min-h-11"
                placeholder="使用逗号分隔，最多 6 个关键词"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="manual-article-tags">文章标签</Label>
              <Input
                id="manual-article-tags"
                name="tagNames"
                required
                className="min-h-11"
                placeholder="使用逗号分隔，首个标签作为推荐标签"
              />
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label htmlFor="manual-article-content">
                {language === "en"
                  ? "英文正文（Markdown）"
                  : "正文（Markdown）"}
              </Label>
              {language === "zh" && sourceMarkdown ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={Boolean(content.trim())}
                  onClick={() => setContent(sourceMarkdown)}
                >
                  使用采集正文作为起点
                </Button>
              ) : null}
            </div>
            <div className="min-w-0 [&_button]:min-h-11">
              <MarkdownEditor
                id="manual-article-content"
                content={content}
                onChange={setContent}
                imageInsertLanguage={language}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-border/70 p-3">
            <Image
              src={DEFAULT_ARTICLE_COVER}
              alt="默认文章封面"
              width={160}
              height={90}
              className="h-auto rounded-md"
            />
            <p className="min-w-0 flex-1 basis-52 text-sm leading-6 text-muted-foreground">
              保存时使用默认封面。需要 AI
              封面时，在文章编辑页手动点击“生成封面图”，
              完成后替换默认图；生成失败时继续保留默认图。
            </p>
          </div>
          {error ? (
            <p role="alert" className="break-words text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            className="min-h-11 w-full sm:w-auto"
            disabled={!content.trim()}
          >
            {isPending ? "正在保存..." : "保存人工内容为草稿"}
          </Button>
        </fieldset>
      </form>
    </AdminSectionCard>
  );
}
