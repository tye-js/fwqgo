"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  BookOpen,
  ExternalLink,
  FilePlus2,
  FolderCog,
  Pencil,
  Save,
  Search,
  Trash2,
} from "lucide-react";

import {
  deleteKnowledgeArticle,
  deleteKnowledgeCategory,
  saveKnowledgeArticle,
  saveKnowledgeCategory,
} from "@/features/cms/actions/knowledge";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";
import { MarkdownEditor } from "@/components/editor/markdown-editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@fwqgo/core/utils";

type KnowledgeCategoryRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  articleCount: number;
};

type KnowledgeArticleListRow = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  categoryName: string;
  published: boolean;
  allowAiReference: boolean;
  updatedAt: Date | null;
  createdAt: Date;
};

type KnowledgeArticleEditorRow = {
  id: number;
  categoryId: number;
  title: string;
  slug: string;
  summary: string | null;
  content: string;
  keywords: string | null;
  aliases: string | null;
  retrievalTerms: string | null;
  sourceNotes: string | null;
  published: boolean;
  allowAiReference: boolean;
};

type ArticleFormState = {
  id?: number;
  categoryId: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  keywords: string;
  aliases: string;
  retrievalTerms: string;
  sourceNotes: string;
  published: boolean;
  allowAiReference: boolean;
};

function createArticleForm(
  article: KnowledgeArticleEditorRow | null,
  categories: KnowledgeCategoryRow[],
): ArticleFormState {
  return article
    ? {
        id: article.id,
        categoryId: String(article.categoryId),
        title: article.title,
        slug: article.slug,
        summary: article.summary ?? "",
        content: article.content,
        keywords: article.keywords ?? "",
        aliases: article.aliases ?? "",
        retrievalTerms: article.retrievalTerms ?? "",
        sourceNotes: article.sourceNotes ?? "",
        published: article.published,
        allowAiReference: article.allowAiReference,
      }
    : {
        categoryId: categories[0] ? String(categories[0].id) : "",
        title: "",
        slug: "",
        summary: "",
        content: "",
        keywords: "",
        aliases: "",
        retrievalTerms: "",
        sourceNotes: "",
        published: false,
        allowAiReference: true,
      };
}

function FormField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function KnowledgeManager({
  categories,
  articles,
  selectedArticle,
  query,
  publicOrigin,
}: {
  categories: KnowledgeCategoryRow[];
  articles: KnowledgeArticleListRow[];
  selectedArticle: KnowledgeArticleEditorRow | null;
  query: string;
  publicOrigin: string;
}) {
  const router = useRouter();
  const { mutate, isPending } = useAdminMutation();
  const [form, setForm] = useState(() =>
    createArticleForm(selectedArticle, categories),
  );
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(
    null,
  );
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState("0");
  const [deleteArticleOpen, setDeleteArticleOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] =
    useState<KnowledgeCategoryRow | null>(null);

  function updateForm<TKey extends keyof ArticleFormState>(
    key: TKey,
    value: ArticleFormState[TKey],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function startNewCategory() {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategorySlug("");
    setCategoryDescription("");
    setCategorySortOrder("0");
  }

  function editCategory(category: KnowledgeCategoryRow) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategorySlug(category.slug);
    setCategoryDescription(category.description ?? "");
    setCategorySortOrder(String(category.sortOrder));
  }

  function handleArticleSave(event: FormEvent) {
    event.preventDefault();
    const categoryId = Number(form.categoryId);
    void mutate({
      key: `knowledge-article-save:${form.id ?? "new"}`,
      pendingMessage: form.published
        ? "正在保存并发布知识条目..."
        : "正在保存知识草稿...",
      action: () =>
        saveKnowledgeArticle({
          id: form.id,
          categoryId,
          title: form.title,
          slug: form.slug,
          summary: form.summary,
          content: form.content,
          keywords: form.keywords,
          aliases: form.aliases,
          retrievalTerms: form.retrievalTerms,
          sourceNotes: form.sourceNotes,
          published: form.published,
          allowAiReference: form.allowAiReference,
        }),
      errorTitle: "知识条目保存失败",
      refresh: false,
      onSuccess: (result) => {
        if (!result.success) return;
        setForm(createArticleForm(result.data, categories));
        router.replace(`/knowledge?id=${result.data.id}`);
        router.refresh();
      },
    });
  }

  function handleArticleDelete() {
    if (!form.id) return;
    void mutate({
      key: `knowledge-article-delete:${form.id}`,
      pendingMessage: "正在删除知识条目...",
      action: () => deleteKnowledgeArticle({ id: form.id! }),
      errorTitle: "知识条目删除失败",
      refresh: false,
      onSuccess: (result) => {
        if (!result.success) return;
        setDeleteArticleOpen(false);
        router.replace("/knowledge");
        router.refresh();
      },
    });
  }

  function handleCategorySave(event: FormEvent) {
    event.preventDefault();
    void mutate({
      key: `knowledge-category-save:${editingCategoryId ?? "new"}`,
      pendingMessage: "正在保存知识分类...",
      action: () =>
        saveKnowledgeCategory({
          id: editingCategoryId ?? undefined,
          name: categoryName,
          slug: categorySlug,
          description: categoryDescription,
          sortOrder: Number.parseInt(categorySortOrder, 10) || 0,
        }),
      errorTitle: "知识分类保存失败",
      refresh: false,
      onSuccess: (result) => {
        if (!result.success) return;
        startNewCategory();
        router.refresh();
      },
    });
  }

  function handleCategoryDelete() {
    if (!categoryToDelete) return;
    const category = categoryToDelete;
    void mutate({
      key: `knowledge-category-delete:${category.id}`,
      pendingMessage: "正在删除知识分类...",
      action: () => deleteKnowledgeCategory({ id: category.id }),
      errorTitle: "知识分类删除失败",
      refresh: false,
      onSuccess: (result) => {
        if (!result.success) return;
        setCategoryToDelete(null);
        startNewCategory();
        router.refresh();
      },
    });
  }

  const savingArticle = isPending(`knowledge-article-save:${form.id ?? "new"}`);
  const deletingArticle = Boolean(
    form.id && isPending(`knowledge-article-delete:${form.id}`),
  );

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <form action="/knowledge" className="flex min-w-0 flex-1 gap-2">
          <div className="relative min-w-0 flex-1 lg:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={query}
              className="pl-9"
              placeholder="搜索标题、摘要、关键词或别名"
            />
          </div>
          <Button type="submit" variant="outline">
            搜索
          </Button>
        </form>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCategoryDialogOpen(true)}
          >
            <FolderCog className="size-4" />
            分类管理
          </Button>
          <Button asChild>
            <Link href="/knowledge">
              <FilePlus2 className="size-4" />
              新建条目
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section className="min-w-0" aria-label="知识条目列表">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">知识条目</h2>
            <Badge variant="outline">{articles.length} 条</Badge>
          </div>
          <div className="max-h-[calc(100dvh-220px)] overflow-y-auto rounded-md border border-border/70">
            {articles.map((article) => (
              <Link
                key={article.id}
                href={`/knowledge?id=${article.id}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                className={cn(
                  "block border-b border-border/60 px-3 py-3 transition-colors last:border-b-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  article.id === selectedArticle?.id && "bg-primary/5",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-sm font-medium leading-5">
                    {article.title}
                  </p>
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      article.published ? "bg-emerald-500" : "bg-amber-500",
                    )}
                    title={article.published ? "已发布" : "草稿"}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {article.categoryName}
                  {article.allowAiReference
                    ? " · AI 可引用"
                    : " · 禁止 AI 引用"}
                </p>
                {article.summary ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {article.summary}
                  </p>
                ) : null}
              </Link>
            ))}
            {articles.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                没有匹配的知识条目。
              </div>
            ) : null}
          </div>
        </section>

        <form onSubmit={handleArticleSave} className="min-w-0 space-y-5">
          <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                <h2 className="text-base font-semibold">
                  {form.id ? "编辑知识条目" : "新建知识条目"}
                </h2>
                <Badge variant={form.published ? "secondary" : "outline"}>
                  {form.published ? "已发布" : "草稿"}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                公开状态控制前台展示；AI 引用开关控制文章改写时是否参与检索。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {form.id && form.published ? (
                <Button asChild type="button" variant="outline" size="sm">
                  <a
                    href={`${publicOrigin}/knowledge/${encodeURIComponent(form.slug)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-4" />
                    查看前台
                  </a>
                </Button>
              ) : null}
              {form.id ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteArticleOpen(true)}
                >
                  <Trash2 className="size-4" />
                  删除
                </Button>
              ) : null}
              <Button
                type="submit"
                size="sm"
                disabled={savingArticle || categories.length === 0}
              >
                <Save className="size-4" />
                {savingArticle ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-md border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              请先创建至少一个知识分类，再新建知识条目。
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <FormField id="knowledge-title" label="标题">
              <Input
                id="knowledge-title"
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                required
              />
            </FormField>
            <FormField id="knowledge-category" label="分类">
              <Select
                value={form.categoryId}
                onValueChange={(value) => updateForm("categoryId", value)}
              >
                <SelectTrigger id="knowledge-category">
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          <FormField id="knowledge-slug" label="Slug" hint="留空时按标题生成">
            <Input
              id="knowledge-slug"
              value={form.slug}
              onChange={(event) => updateForm("slug", event.target.value)}
              placeholder="例如 cn2-gia"
            />
          </FormField>

          <FormField
            id="knowledge-summary"
            label="摘要"
            hint="用于列表和检索上下文"
          >
            <Textarea
              id="knowledge-summary"
              value={form.summary}
              onChange={(event) => updateForm("summary", event.target.value)}
              rows={3}
            />
          </FormField>

          <FormField id="knowledge-content" label="正文" hint="Markdown">
            <MarkdownEditor
              content={form.content}
              onChange={(value) => updateForm("content", value)}
              minHeightClassName="min-h-[420px]"
            />
          </FormField>

          <div className="grid gap-4 lg:grid-cols-3">
            <FormField
              id="knowledge-keywords"
              label="关键词"
              hint="逗号或换行分隔"
            >
              <Textarea
                id="knowledge-keywords"
                value={form.keywords}
                onChange={(event) => updateForm("keywords", event.target.value)}
                rows={4}
              />
            </FormField>
            <FormField
              id="knowledge-aliases"
              label="别名"
              hint="如 CMIN2、移动精品网"
            >
              <Textarea
                id="knowledge-aliases"
                value={form.aliases}
                onChange={(event) => updateForm("aliases", event.target.value)}
                rows={4}
              />
            </FormField>
            <FormField
              id="knowledge-retrieval"
              label="AI 检索词"
              hint="补充容易命中的表达"
            >
              <Textarea
                id="knowledge-retrieval"
                value={form.retrievalTerms}
                onChange={(event) =>
                  updateForm("retrievalTerms", event.target.value)
                }
                rows={4}
              />
            </FormField>
          </div>

          <FormField id="knowledge-source" label="来源说明" hint="仅后台可见">
            <Textarea
              id="knowledge-source"
              value={form.sourceNotes}
              onChange={(event) =>
                updateForm("sourceNotes", event.target.value)
              }
              rows={3}
              placeholder="记录资料来源、更新时间和需要复核的事项"
            />
          </FormField>

          <div className="grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 sm:grid-cols-2">
            <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 bg-background px-4 py-3">
              <span>
                <span className="block text-sm font-medium">公开发布</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  在前台知识库展示
                </span>
              </span>
              <Switch
                checked={form.published}
                onCheckedChange={(value) => updateForm("published", value)}
              />
            </label>
            <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 bg-background px-4 py-3">
              <span>
                <span className="block text-sm font-medium">允许 AI 引用</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  改写时作为通用知识检索
                </span>
              </span>
              <Switch
                checked={form.allowAiReference}
                onCheckedChange={(value) =>
                  updateForm("allowAiReference", value)
                }
              />
            </label>
          </div>
        </form>
      </div>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-h-[88dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>知识分类管理</DialogTitle>
            <DialogDescription>
              分类用于前台筛选和 AI 检索加权。已有条目的分类不能直接删除。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_280px]">
            <div className="overflow-hidden rounded-md border border-border/70">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {category.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {category.slug} · {category.articleCount} 条
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="编辑分类"
                      aria-label={`编辑分类 ${category.name}`}
                      onClick={() => editCategory(category)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="删除分类"
                      aria-label={`删除分类 ${category.name}`}
                      onClick={() => setCategoryToDelete(category)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
              {categories.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                  暂无知识分类。
                </p>
              ) : null}
            </div>

            <form onSubmit={handleCategorySave} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {editingCategoryId ? "编辑分类" : "新建分类"}
                </h3>
                {editingCategoryId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={startNewCategory}
                  >
                    新建
                  </Button>
                ) : null}
              </div>
              <FormField id="category-name" label="名称">
                <Input
                  id="category-name"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  required
                />
              </FormField>
              <FormField id="category-slug" label="Slug" hint="可留空">
                <Input
                  id="category-slug"
                  value={categorySlug}
                  onChange={(event) => setCategorySlug(event.target.value)}
                />
              </FormField>
              <FormField id="category-description" label="说明">
                <Textarea
                  id="category-description"
                  value={categoryDescription}
                  onChange={(event) =>
                    setCategoryDescription(event.target.value)
                  }
                  rows={3}
                />
              </FormField>
              <FormField id="category-sort" label="排序">
                <Input
                  id="category-sort"
                  type="number"
                  value={categorySortOrder}
                  onChange={(event) => setCategorySortOrder(event.target.value)}
                />
              </FormField>
              <Button
                type="submit"
                className="w-full"
                disabled={isPending(
                  `knowledge-category-save:${editingCategoryId ?? "new"}`,
                )}
              >
                <Save className="size-4" />
                保存分类
              </Button>
            </form>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCategoryDialogOpen(false)}
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteArticleOpen} onOpenChange={setDeleteArticleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除知识条目？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后前台页面和 AI 检索都将失去这条资料，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingArticle}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArticleDelete}
              disabled={deletingArticle}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingArticle ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(categoryToDelete)}
        onOpenChange={(open) => !open && setCategoryToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除分类？</AlertDialogTitle>
            <AlertDialogDescription>
              {categoryToDelete?.articleCount
                ? `“${categoryToDelete.name}”仍有 ${categoryToDelete.articleCount} 条知识，必须先移动或删除条目。`
                : `将删除“${categoryToDelete?.name ?? ""}”分类，此操作不可撤销。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCategoryDelete}
              disabled={Boolean(categoryToDelete?.articleCount)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
