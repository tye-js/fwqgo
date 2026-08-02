"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  useState,
} from "react";
import {
  BookOpen,
  Bot,
  CircleCheck,
  CircleOff,
  ExternalLink,
  FilePlus2,
  FolderCog,
  Languages,
  Link2,
  Pencil,
  Save,
  Search,
  Trash2,
} from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import {
  confirmKnowledgeTranslation,
  deleteKnowledgeArticle,
  deleteKnowledgeCategory,
  saveKnowledgeArticle,
  saveKnowledgeCategory,
  updateKnowledgeAiReference,
  updateKnowledgePublication,
} from "@/features/cms/actions/knowledge";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";
import { useUnsavedChangesGuard } from "@/features/cms/hooks/use-unsaved-changes-guard";
import { cn } from "@fwqgo/core/utils";

type KnowledgeLanguage = "zh" | "en";

type KnowledgeCategoryRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  enName: string | null;
  enSlug: string | null;
  enDescription: string | null;
  sortOrder: number;
  articleCount: number;
};

type KnowledgeArticleListRow = {
  id: number;
  title: string;
  slug: string;
  summary: string | null;
  definition: string | null;
  language: string;
  categoryName: string;
  categoryEnName: string | null;
  published: boolean;
  allowAiReference: boolean;
  contentRevision: number;
  translatedFromRevision: number | null;
  translationSourceArticleId: number | null;
  sourceContentRevision: number | null;
  sourcePublished: boolean | null;
  translationArticleId: number | null;
  translationPublished: boolean | null;
  translationContentRevision: number | null;
  translationTranslatedFromRevision: number | null;
  contentUpdatedAt: Date;
  updatedAt: Date | null;
  createdAt: Date;
};

type PairedArticleSummary = {
  id: number;
  title: string;
  slug: string;
  published: boolean;
  contentRevision: number;
  translatedFromRevision?: number | null;
};

type KnowledgeArticleEditorRow = {
  id: number;
  categoryId: number;
  title: string;
  slug: string;
  summary: string | null;
  definition: string | null;
  highlights: string[] | null;
  quickTip: string | null;
  content: string;
  keywords: string | null;
  aliases: string | null;
  retrievalTerms: string | null;
  sourceNotes: string | null;
  language: string;
  translationSourceArticleId: number | null;
  contentRevision: number;
  translatedFromRevision: number | null;
  published: boolean;
  allowAiReference: boolean;
  publishedAt: Date | null;
  contentUpdatedAt: Date;
  source: PairedArticleSummary | null;
  translation: PairedArticleSummary | null;
};

type TranslationDraftSource = {
  id: number;
  categoryId: number;
  title: string;
  slug: string;
  contentRevision: number;
  published: boolean;
};

type ArticleFormState = {
  id?: number;
  language: KnowledgeLanguage;
  translationSourceArticleId: number | null;
  expectedContentRevision?: number;
  categoryId: string;
  title: string;
  slug: string;
  summary: string;
  definition: string;
  highlights: string;
  quickTip: string;
  content: string;
  keywords: string;
  aliases: string;
  retrievalTerms: string;
  sourceNotes: string;
};

type ArticleStatusState = {
  id?: number;
  language: KnowledgeLanguage;
  published: boolean;
  allowAiReference: boolean;
  publishedAt: Date | null;
  contentRevision: number;
  translatedFromRevision: number | null;
  sourceContentRevision: number | null;
};

function createArticleForm(
  article: KnowledgeArticleEditorRow | null,
  categories: KnowledgeCategoryRow[],
  language: KnowledgeLanguage,
  translationSource: TranslationDraftSource | null,
): ArticleFormState {
  if (article) {
    return {
      id: article.id,
      language: article.language === "en" ? "en" : "zh",
      translationSourceArticleId: article.translationSourceArticleId,
      expectedContentRevision: article.contentRevision,
      categoryId: String(article.categoryId),
      title: article.title,
      slug: article.slug,
      summary: article.summary ?? "",
      definition: article.definition ?? "",
      highlights: (article.highlights ?? []).join("\n"),
      quickTip: article.quickTip ?? "",
      content: article.content,
      keywords: article.keywords ?? "",
      aliases: article.aliases ?? "",
      retrievalTerms: article.retrievalTerms ?? "",
      sourceNotes: article.sourceNotes ?? "",
    };
  }

  return {
    language,
    translationSourceArticleId: translationSource?.id ?? null,
    categoryId: String(
      translationSource?.categoryId ?? categories[0]?.id ?? "",
    ),
    title: "",
    slug: "",
    summary: "",
    definition: "",
    highlights: "",
    quickTip: "",
    content: "",
    keywords: "",
    aliases: "",
    retrievalTerms: "",
    sourceNotes: "",
  };
}

function createArticleStatus(
  article: KnowledgeArticleEditorRow | null,
  language: KnowledgeLanguage,
  translationSource: TranslationDraftSource | null,
): ArticleStatusState {
  const emptyStatus = {
    published: false,
    allowAiReference: false,
  } as const;
  return {
    id: article?.id,
    language: article?.language === "en" ? "en" : language,
    published: article?.published ?? emptyStatus.published,
    allowAiReference: article?.allowAiReference ?? emptyStatus.allowAiReference,
    publishedAt: article?.publishedAt ?? null,
    contentRevision: article?.contentRevision ?? 1,
    translatedFromRevision: article?.translatedFromRevision ?? null,
    sourceContentRevision:
      article?.source?.contentRevision ??
      translationSource?.contentRevision ??
      null,
  };
}

function articleFormsEqual(left: ArticleFormState, right: ArticleFormState) {
  return (
    left.id === right.id &&
    left.language === right.language &&
    left.translationSourceArticleId === right.translationSourceArticleId &&
    left.expectedContentRevision === right.expectedContentRevision &&
    left.categoryId === right.categoryId &&
    left.title === right.title &&
    left.slug === right.slug &&
    left.summary === right.summary &&
    left.definition === right.definition &&
    left.highlights === right.highlights &&
    left.quickTip === right.quickTip &&
    left.content === right.content &&
    left.keywords === right.keywords &&
    left.aliases === right.aliases &&
    left.retrievalTerms === right.retrievalTerms &&
    left.sourceNotes === right.sourceNotes
  );
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

function parseHighlightLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function knowledgeAdminHref(input: {
  language: KnowledgeLanguage;
  id?: number;
  sourceId?: number;
  query?: string;
}) {
  const params = new URLSearchParams({ language: input.language });
  if (input.id) params.set("id", String(input.id));
  if (input.sourceId) params.set("sourceId", String(input.sourceId));
  if (input.query) params.set("q", input.query);
  return `/knowledge?${params.toString()}`;
}

export function KnowledgeManager({
  categories,
  articles,
  selectedArticle,
  translationSource,
  language,
  query,
  publicOrigin,
}: {
  categories: KnowledgeCategoryRow[];
  articles: KnowledgeArticleListRow[];
  selectedArticle: KnowledgeArticleEditorRow | null;
  translationSource: TranslationDraftSource | null;
  language: KnowledgeLanguage;
  query: string;
  publicOrigin: string;
}) {
  const router = useRouter();
  const { mutate, isPending, isAnyPending } = useAdminMutation();
  const [initialForm] = useState(() =>
    createArticleForm(selectedArticle, categories, language, translationSource),
  );
  const [form, setForm] = useState(initialForm);
  const [savedForm, setSavedForm] = useState(initialForm);
  const [status, setStatus] = useState(() =>
    createArticleStatus(selectedArticle, language, translationSource),
  );
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(
    null,
  );
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [categoryDescription, setCategoryDescription] = useState("");
  const [categoryEnName, setCategoryEnName] = useState("");
  const [categoryEnSlug, setCategoryEnSlug] = useState("");
  const [categoryEnDescription, setCategoryEnDescription] = useState("");
  const [categorySortOrder, setCategorySortOrder] = useState("0");
  const [deleteArticleOpen, setDeleteArticleOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] =
    useState<KnowledgeCategoryRow | null>(null);
  const [pendingNavigationHref, setPendingNavigationHref] = useState<
    string | null
  >(null);
  const articleFormDirty = !articleFormsEqual(form, savedForm);
  const savingArticle = isPending(`knowledge-article-save:${form.id ?? "new"}`);
  const deletingArticle = Boolean(
    form.id && isPending(`knowledge-article-delete:${form.id}`),
  );
  const contentLocked = status.language === "en" && status.published;
  const translationSynced =
    status.language === "en" &&
    status.sourceContentRevision !== null &&
    status.translatedFromRevision === status.sourceContentRevision;
  const publicationFieldsReady = Boolean(
    form.summary.trim() &&
    form.definition.trim() &&
    parseHighlightLines(form.highlights).length >= 2 &&
    parseHighlightLines(form.highlights).length <= 3 &&
    form.quickTip.trim() &&
    form.keywords.trim() &&
    form.retrievalTerms.trim() &&
    form.sourceNotes.trim(),
  );
  const publicationBlocked =
    !publicationFieldsReady || (form.language === "en" && !translationSynced);
  const aiAuthorizationBlocked =
    !status.published || (form.language === "en" && !translationSynced);

  useUnsavedChangesGuard({
    enabled: articleFormDirty || savingArticle,
    onNavigationAttempt: (href) => {
      if (!savingArticle) setPendingNavigationHref(href);
    },
  });

  function updateForm<TKey extends keyof ArticleFormState>(
    key: TKey,
    value: ArticleFormState[TKey],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function requestArticleNavigation(
    event: ReactMouseEvent<HTMLAnchorElement>,
    href: string,
    targetId: number | null,
  ) {
    const targetsCurrentForm =
      targetId === null ? !form.id : targetId === form.id;
    if (targetsCurrentForm || savingArticle) {
      event.preventDefault();
      return;
    }
    if (!articleFormDirty) return;
    event.preventDefault();
    setPendingNavigationHref(href);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    if (!articleFormDirty && !savingArticle) return;
    event.preventDefault();
    if (savingArticle) return;
    const formData = new FormData(event.currentTarget);
    const value = formData.get("q");
    const nextQuery = typeof value === "string" ? value.trim() : "";
    setPendingNavigationHref(
      knowledgeAdminHref({ language, query: nextQuery || undefined }),
    );
  }

  function discardChangesAndNavigate() {
    const href = pendingNavigationHref;
    setPendingNavigationHref(null);
    if (href) router.push(href);
  }

  function startNewCategory() {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategorySlug("");
    setCategoryDescription("");
    setCategoryEnName("");
    setCategoryEnSlug("");
    setCategoryEnDescription("");
    setCategorySortOrder("0");
  }

  function editCategory(category: KnowledgeCategoryRow) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategorySlug(category.slug);
    setCategoryDescription(category.description ?? "");
    setCategoryEnName(category.enName ?? "");
    setCategoryEnSlug(category.enSlug ?? "");
    setCategoryEnDescription(category.enDescription ?? "");
    setCategorySortOrder(String(category.sortOrder));
  }

  function handleArticleSave(event: FormEvent) {
    event.preventDefault();
    const categoryId = Number(form.categoryId);
    void mutate({
      key: `knowledge-article-save:${form.id ?? "new"}`,
      pendingMessage:
        form.language === "en"
          ? "正在保存英文知识草稿..."
          : "正在保存中文知识草稿...",
      action: () =>
        saveKnowledgeArticle({
          id: form.id,
          language: form.language,
          translationSourceArticleId: form.translationSourceArticleId,
          categoryId: form.language === "zh" ? categoryId : undefined,
          expectedContentRevision: form.expectedContentRevision,
          title: form.title,
          slug: form.slug,
          summary: form.summary,
          definition: form.definition,
          highlights: parseHighlightLines(form.highlights),
          quickTip: form.quickTip,
          content: form.content,
          keywords: form.keywords,
          aliases: form.aliases,
          retrievalTerms: form.retrievalTerms,
          sourceNotes: form.sourceNotes,
        }),
      errorTitle: "知识草稿保存失败",
      refresh: false,
      onSuccess: (result) => {
        if (!result.success) return;
        const savedArticle = createArticleForm(
          {
            ...result.data,
            source: selectedArticle?.source ?? null,
            translation: selectedArticle?.translation ?? null,
          },
          categories,
          form.language,
          translationSource,
        );
        setForm(savedArticle);
        setSavedForm(savedArticle);
        setStatus((current) => ({
          ...current,
          id: result.data.id,
          language: result.data.language === "en" ? "en" : "zh",
          published: result.data.published,
          allowAiReference: result.data.allowAiReference,
          publishedAt: result.data.publishedAt,
          contentRevision: result.data.contentRevision,
          translatedFromRevision: result.data.translatedFromRevision,
          sourceContentRevision:
            result.data.language === "zh"
              ? result.data.contentRevision
              : current.sourceContentRevision,
        }));
        router.replace(
          knowledgeAdminHref({
            language: result.data.language === "en" ? "en" : "zh",
            id: result.data.id,
          }),
        );
        router.refresh();
      },
    });
  }

  function handlePublication(published: boolean) {
    if (!form.id || articleFormDirty) return;
    void mutate({
      key: `knowledge-article-publication:${form.id}`,
      pendingMessage: published
        ? "正在发布知识条目..."
        : "正在取消发布知识条目...",
      action: () =>
        updateKnowledgePublication({
          id: form.id!,
          expectedContentRevision: status.contentRevision,
          published,
          allowAiReference: status.allowAiReference,
        }),
      errorTitle: "知识发布状态更新失败",
      refresh: false,
      onSuccess: (result) => {
        if (!result.success) return;
        const value = result.data.published;
        setStatus((current) => ({
          ...current,
          published: value,
          allowAiReference: value ? current.allowAiReference : false,
          publishedAt: result.data.publishedAt,
        }));
        router.refresh();
      },
    });
  }

  function handleAiReference(allowAiReference: boolean) {
    if (!form.id || articleFormDirty) return;
    void mutate({
      key: `knowledge-article-ai:${form.id}`,
      pendingMessage: allowAiReference
        ? "正在授权 AI 引用..."
        : "正在关闭 AI 引用...",
      action: () =>
        updateKnowledgeAiReference({
          id: form.id!,
          expectedContentRevision: status.contentRevision,
          allowAiReference,
        }),
      errorTitle: "AI 引用状态更新失败",
      refresh: false,
      onSuccess: (result) => {
        if (!result.success) return;
        setStatus((current) => ({
          ...current,
          allowAiReference: result.data.allowAiReference,
        }));
        router.refresh();
      },
    });
  }

  function handleTranslationConfirmation() {
    if (!form.id || form.language !== "en" || articleFormDirty) return;
    void mutate({
      key: `knowledge-article-sync:${form.id}`,
      pendingMessage: "正在确认译文同步状态...",
      action: () =>
        confirmKnowledgeTranslation({
          id: form.id!,
          expectedContentRevision: status.contentRevision,
        }),
      errorTitle: "译文同步确认失败",
      refresh: false,
      onSuccess: (result) => {
        if (!result.success) return;
        setStatus((current) => ({
          ...current,
          translatedFromRevision: result.data.translatedFromRevision,
        }));
        router.refresh();
      },
    });
  }

  function handleArticleDelete() {
    if (!form.id) return;
    void mutate({
      key: `knowledge-article-delete:${form.id}`,
      pendingMessage: "正在删除知识条目...",
      action: () =>
        deleteKnowledgeArticle({
          id: form.id!,
          expectedContentRevision: status.contentRevision,
        }),
      errorTitle: "知识条目删除失败",
      refresh: false,
      onSuccess: (result) => {
        if (!result.success) return;
        setDeleteArticleOpen(false);
        router.replace(knowledgeAdminHref({ language }));
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
          enName: categoryEnName,
          enSlug: categoryEnSlug,
          enDescription: categoryEnDescription,
          sortOrder: Number.parseInt(categorySortOrder, 10) || 0,
        }),
      errorTitle: "知识分类保存失败",
      refresh: false,
      onSuccess: (result) => {
        if (!result.success) return;
        const createdCategoryId = String(result.data.id);
        setForm((current) =>
          current.categoryId
            ? current
            : { ...current, categoryId: createdCategoryId },
        );
        setSavedForm((current) =>
          current.categoryId
            ? current
            : { ...current, categoryId: createdCategoryId },
        );
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
        const fallbackCategoryId = String(
          categories.find((item) => item.id !== category.id)?.id ?? "",
        );
        setForm((current) =>
          current.categoryId === String(category.id)
            ? { ...current, categoryId: fallbackCategoryId }
            : current,
        );
        setSavedForm((current) =>
          current.categoryId === String(category.id)
            ? { ...current, categoryId: fallbackCategoryId }
            : current,
        );
        setCategoryToDelete(null);
        startNewCategory();
        router.refresh();
      },
    });
  }

  const sourceArticle = selectedArticle?.source ?? translationSource;
  const translationArticle = selectedArticle?.translation ?? null;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-h-10 items-center gap-1 rounded-md border border-border/70 bg-muted/30 p-1">
          {(["zh", "en"] as const).map((item) => (
            <Button
              key={item}
              asChild
              size="sm"
              variant={language === item ? "secondary" : "ghost"}
            >
              <Link href={knowledgeAdminHref({ language: item })}>
                {item === "zh" ? "中文" : "English"}
              </Link>
            </Button>
          ))}
        </div>
        <form
          action="/knowledge"
          onSubmit={handleSearchSubmit}
          className="flex min-w-0 flex-1 gap-2 lg:max-w-lg"
        >
          <input type="hidden" name="language" value={language} />
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={query}
              className="pl-9"
              placeholder="搜索标题、定义、要点、摘要或关键词"
            />
          </div>
          <Button type="submit" variant="outline" disabled={savingArticle}>
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
          {language === "zh" ? (
            <Button asChild>
              <Link
                href={knowledgeAdminHref({ language: "zh" })}
                onClick={(event) =>
                  requestArticleNavigation(
                    event,
                    knowledgeAdminHref({ language: "zh" }),
                    null,
                  )
                }
              >
                <FilePlus2 className="size-4" />
                新建中文稿
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <section className="min-w-0" aria-label="知识条目列表">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              {language === "en" ? "英文知识稿" : "中文知识稿"}
            </h2>
            <Badge variant="outline">{articles.length} 条</Badge>
          </div>
          <div className="max-h-[calc(100dvh-220px)] overflow-y-auto rounded-md border border-border/70">
            {articles.map((article) => {
              const articleHref = knowledgeAdminHref({
                language,
                id: article.id,
                query: query || undefined,
              });
              const synced =
                language === "en" &&
                article.sourceContentRevision !== null &&
                article.translatedFromRevision ===
                  article.sourceContentRevision;
              return (
                <Link
                  key={article.id}
                  href={articleHref}
                  onClick={(event) =>
                    requestArticleNavigation(event, articleHref, article.id)
                  }
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
                    {language === "en"
                      ? (article.categoryEnName ?? article.categoryName)
                      : article.categoryName}
                    {article.allowAiReference
                      ? " · AI 可引用"
                      : " · 禁止 AI 引用"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    v{article.contentRevision}
                    {language === "en"
                      ? synced
                        ? " · 已同步"
                        : " · 待同步"
                      : article.translationArticleId
                        ? " · 已有英文稿"
                        : " · 未创建英文稿"}
                  </p>
                  {article.definition ? (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {article.definition}
                    </p>
                  ) : null}
                </Link>
              );
            })}
            {articles.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-muted-foreground">
                没有匹配的知识条目。
              </div>
            ) : null}
          </div>
        </section>

        <div className="min-w-0">
          <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                <h2 className="text-base font-semibold">
                  {form.id
                    ? form.language === "en"
                      ? "编辑英文知识稿"
                      : "编辑中文知识稿"
                    : form.language === "en"
                      ? "新建英文知识稿"
                      : "新建中文知识稿"}
                </h2>
                <Badge variant={status.published ? "secondary" : "outline"}>
                  {status.published ? "已发布" : "草稿"}
                </Badge>
                <Badge variant="outline">v{status.contentRevision}</Badge>
                {form.language === "en" ? (
                  <Badge variant={translationSynced ? "secondary" : "outline"}>
                    {translationSynced ? "译文已同步" : "译文待同步"}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                正文保存、发布、译文同步和 AI
                授权为独立操作，状态变化均使用内容版本校验。
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {form.id && status.published ? (
                <Button asChild type="button" variant="outline" size="sm">
                  {form.language === "en" ? (
                    <a
                      href={`${publicOrigin}/en/knowledge/${encodeURIComponent(form.slug)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      查看前台
                    </a>
                  ) : (
                    <a
                      href={`${publicOrigin}/knowledge/${encodeURIComponent(form.slug)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-4" />
                      查看前台
                    </a>
                  )}
                </Button>
              ) : null}
              {form.id ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteArticleOpen(true)}
                  disabled={isAnyPending}
                >
                  <Trash2 className="size-4" />
                  删除
                </Button>
              ) : null}
            </div>
          </div>

          {sourceArticle ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-border/70 bg-muted/20 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">
                  中文源稿 · v{sourceArticle.contentRevision}
                </p>
                <p className="mt-1 truncate text-sm font-medium">
                  {sourceArticle.title}
                </p>
              </div>
              {selectedArticle?.source ? (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={knowledgeAdminHref({
                      language: "zh",
                      id: selectedArticle.source.id,
                    })}
                  >
                    <Link2 className="size-4" />
                    打开中文稿
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          {form.language === "zh" && form.id ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-border/70 bg-muted/20 px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {translationArticle ? "英文稿已创建" : "尚未创建英文稿"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {translationArticle
                    ? `英文 v${translationArticle.contentRevision} · ${translationArticle.published ? "已发布" : "草稿"}`
                    : "英文稿将继承当前分类，并单独保存、审核和发布。"}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={
                    translationArticle
                      ? knowledgeAdminHref({
                          language: "en",
                          id: translationArticle.id,
                        })
                      : knowledgeAdminHref({
                          language: "en",
                          sourceId: form.id,
                        })
                  }
                >
                  <Languages className="size-4" />
                  {translationArticle ? "打开英文稿" : "创建英文稿"}
                </Link>
              </Button>
            </div>
          ) : null}

          {form.id ? (
            <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-border/70 bg-border/70 lg:grid-cols-3">
              <div className="flex min-h-24 flex-col justify-between gap-3 bg-background p-4">
                <div>
                  <p className="text-sm font-medium">公开状态</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {status.published ? "当前前台可见" : "当前仅后台可见"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={status.published ? "outline" : "default"}
                  disabled={
                    articleFormDirty ||
                    isAnyPending ||
                    (!status.published && publicationBlocked)
                  }
                  onClick={() => handlePublication(!status.published)}
                >
                  {status.published ? (
                    <CircleOff className="size-4" />
                  ) : (
                    <CircleCheck className="size-4" />
                  )}
                  {status.published ? "取消发布" : "发布"}
                </Button>
              </div>
              <div className="flex min-h-24 flex-col justify-between gap-3 bg-background p-4">
                <div>
                  <p className="text-sm font-medium">AI 引用</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {status.allowAiReference
                      ? "已进入本语言知识检索"
                      : "当前不会被 AI 检索"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={status.allowAiReference ? "outline" : "secondary"}
                  // AI authorization is unavailable while unpublished
                  // (contract equivalent: disabled={!form.published}).
                  disabled={
                    articleFormDirty ||
                    isAnyPending ||
                    (!status.allowAiReference && aiAuthorizationBlocked)
                  }
                  onClick={() => handleAiReference(!status.allowAiReference)}
                >
                  <Bot className="size-4" />
                  {status.allowAiReference ? "关闭 AI 引用" : "允许 AI 引用"}
                </Button>
              </div>
              <div className="flex min-h-24 flex-col justify-between gap-3 bg-background p-4">
                <div>
                  <p className="text-sm font-medium">版本状态</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {form.language === "en"
                      ? translationSynced
                        ? `已同步到中文 v${status.sourceContentRevision}`
                        : `待同步到中文 v${status.sourceContentRevision ?? "-"}`
                      : translationArticle
                        ? "中文更新会使英文稿进入待同步"
                        : "当前没有英文配对"}
                  </p>
                </div>
                {form.language === "en" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      translationSynced || articleFormDirty || isAnyPending
                    }
                    onClick={handleTranslationConfirmation}
                  >
                    <Languages className="size-4" />
                    确认已同步
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="ghost" disabled>
                    <Link2 className="size-4" />
                    中文源稿
                  </Button>
                )}
              </div>
            </div>
          ) : null}

          {contentLocked ? (
            <div className="mt-4 border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              已发布英文稿不能直接修改正文。请先取消发布，再保存草稿、确认同步并重新发布。
            </div>
          ) : null}

          <form
            onSubmit={handleArticleSave}
            className="mt-5 min-w-0"
            aria-busy={savingArticle}
          >
            <fieldset disabled={savingArticle}>
              <fieldset
                disabled={contentLocked}
                className="min-w-0 space-y-5"
              >
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
                    onChange={(event) =>
                      updateForm("title", event.target.value)
                    }
                    required
                  />
                </FormField>
                <FormField
                  id="knowledge-category"
                  label="分类"
                  hint={form.language === "en" ? "继承中文源稿" : undefined}
                >
                  <Select
                    value={form.categoryId}
                    disabled={form.language === "en"}
                    onValueChange={(value) => updateForm("categoryId", value)}
                  >
                    <SelectTrigger id="knowledge-category">
                      <SelectValue placeholder="选择分类" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem
                          key={category.id}
                          value={String(category.id)}
                        >
                          {form.language === "en"
                            ? (category.enName ?? category.name)
                            : category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <FormField
                id="knowledge-slug"
                label="Slug"
                hint={
                  status.publishedAt ? "首次发布后已锁定" : "留空时按标题生成"
                }
              >
                <Input
                  id="knowledge-slug"
                  value={form.slug}
                  disabled={Boolean(status.publishedAt)}
                  onChange={(event) => updateForm("slug", event.target.value)}
                  placeholder={
                    form.language === "en"
                      ? "server-routing-guide"
                      : "例如 cn2-gia"
                  }
                />
              </FormField>

              <FormField id="knowledge-summary" label="摘要" hint="发布必填">
                <Textarea
                  id="knowledge-summary"
                  value={form.summary}
                  onChange={(event) =>
                    updateForm("summary", event.target.value)
                  }
                  rows={3}
                />
              </FormField>

              <div className="space-y-4 rounded-md border border-border/70 bg-muted/20 p-4">
                <div>
                  <h3 className="text-sm font-semibold">知识卡片</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    中英文稿分别维护；前台卡片只展示定义、核心要点和速查，摘要继续用于 SEO 与详情内容。
                  </p>
                </div>
                <FormField
                  id="knowledge-definition"
                  label="一句话定义"
                  hint="发布必填，建议 1 句"
                >
                  <Textarea
                    id="knowledge-definition"
                    value={form.definition}
                    onChange={(event) =>
                      updateForm("definition", event.target.value)
                    }
                    rows={2}
                    maxLength={600}
                    placeholder={
                      form.language === "en"
                        ? "Define the topic in one concise sentence."
                        : "用一句话说明这个知识点解决什么问题。"
                    }
                  />
                </FormField>
                <FormField
                  id="knowledge-highlights"
                  label="核心要点"
                  hint="发布必填，每行 1 条，共 2–3 条"
                >
                  <Textarea
                    id="knowledge-highlights"
                    value={form.highlights}
                    onChange={(event) =>
                      updateForm("highlights", event.target.value)
                    }
                    rows={5}
                    placeholder={
                      form.language === "en"
                        ? "**Key term**: concise explanation"
                        : "**重点词**：简短解释"
                    }
                  />
                </FormField>
                <FormField
                  id="knowledge-quick-tip"
                  label="速查 / 避坑"
                  hint="发布必填，给出可执行检查"
                >
                  <Textarea
                    id="knowledge-quick-tip"
                    value={form.quickTip}
                    onChange={(event) =>
                      updateForm("quickTip", event.target.value)
                    }
                    rows={2}
                    maxLength={600}
                    placeholder={
                      form.language === "en"
                        ? "State one practical check or pitfall."
                        : "写一条可验证的检查方法或避坑建议。"
                    }
                  />
                </FormField>
              </div>

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
                  hint="发布必填"
                >
                  <Textarea
                    id="knowledge-keywords"
                    value={form.keywords}
                    onChange={(event) =>
                      updateForm("keywords", event.target.value)
                    }
                    rows={4}
                  />
                </FormField>
                <FormField
                  id="knowledge-aliases"
                  label="别名"
                  hint="仅真实别名"
                >
                  <Textarea
                    id="knowledge-aliases"
                    value={form.aliases}
                    onChange={(event) =>
                      updateForm("aliases", event.target.value)
                    }
                    rows={4}
                  />
                </FormField>
                <FormField
                  id="knowledge-retrieval"
                  label="AI 检索词"
                  hint="发布必填"
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

              <FormField
                id="knowledge-source"
                label="来源说明"
                hint="发布必填，仅后台可见"
              >
                <Textarea
                  id="knowledge-source"
                  value={form.sourceNotes}
                  onChange={(event) =>
                    updateForm("sourceNotes", event.target.value)
                  }
                  rows={5}
                  placeholder="事实等级｜核验日期｜URL｜支持主张｜审核人｜下次复核日｜风险"
                />
              </FormField>

              <div className="flex justify-end border-t border-border/70 pt-4">
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingArticle || categories.length === 0}
                >
                  <Save className="size-4" />
                  {savingArticle ? "保存中..." : "保存草稿"}
                </Button>
              </div>
              </fieldset>
            </fieldset>
          </form>
        </div>
      </div>

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="max-h-[88dvh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>知识分类管理</DialogTitle>
            <DialogDescription>
              英文名称、slug 和说明完整后，该分类中的英文知识稿才能发布。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-hidden rounded-md border border-border/70">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {category.name}
                      {category.enName ? ` / ${category.enName}` : ""}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {category.slug}
                      {category.enSlug ? ` · ${category.enSlug}` : ""} ·{" "}
                      {category.articleCount} 条
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
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="category-name" label="中文名称">
                  <Input
                    id="category-name"
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    required
                  />
                </FormField>
                <FormField id="category-en-name" label="英文名称">
                  <Input
                    id="category-en-name"
                    value={categoryEnName}
                    onChange={(event) => setCategoryEnName(event.target.value)}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField id="category-slug" label="中文 Slug" hint="可留空">
                  <Input
                    id="category-slug"
                    value={categorySlug}
                    onChange={(event) => setCategorySlug(event.target.value)}
                  />
                </FormField>
                <FormField id="category-en-slug" label="英文 Slug">
                  <Input
                    id="category-en-slug"
                    value={categoryEnSlug}
                    onChange={(event) => setCategoryEnSlug(event.target.value)}
                  />
                </FormField>
              </div>
              <FormField id="category-description" label="中文说明">
                <Textarea
                  id="category-description"
                  value={categoryDescription}
                  onChange={(event) =>
                    setCategoryDescription(event.target.value)
                  }
                  rows={3}
                />
              </FormField>
              <FormField id="category-en-description" label="英文说明">
                <Textarea
                  id="category-en-description"
                  value={categoryEnDescription}
                  onChange={(event) =>
                    setCategoryEnDescription(event.target.value)
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

      <AlertDialog
        open={Boolean(pendingNavigationHref)}
        onOpenChange={(open) => !open && setPendingNavigationHref(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
            <AlertDialogDescription>
              当前知识条目有尚未保存的内容，继续后这些修改将丢失。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={discardChangesAndNavigate}
            >
              放弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteArticleOpen} onOpenChange={setDeleteArticleOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除知识条目？</AlertDialogTitle>
            <AlertDialogDescription>
              {form.language === "zh"
                ? "中文源稿存在英文稿时无法删除。删除成功后前台与 AI 检索将失去该资料。"
                : "删除英文稿不会影响中文源稿，但前台英文页面将立即失效。"}
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
                ? `“${categoryToDelete.name}”仍有 ${categoryToDelete.articleCount} 条当前语言知识，数据库会再次检查全部语言记录。`
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
