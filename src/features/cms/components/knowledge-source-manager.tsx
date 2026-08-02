"use client";

import { useState, type FormEvent } from "react";
import { FilePlus2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createKnowledgeSource,
} from "@/features/cms/actions/knowledge-sources";
import { useAdminMutation } from "@/features/cms/hooks/use-admin-mutation";

type SourceRow = {
  id: number;
  sourceKey: string;
  kind: string;
  authorityTier: string;
  status: string;
  reviewDueAt: Date | null;
  validUntil: Date | null;
  currentRevisionId: number | null;
  revision: number | null;
  title: string | null;
  canonicalUrl: string | null;
  retrievedAt: Date | null;
};

const emptyDraft = {
  sourceKey: "",
  kind: "official",
  authorityTier: "A" as "A" | "B" | "C",
  publisher: "",
  title: "",
  canonicalUrl: "",
  contentHash: "",
  changeReason: "initial",
  reviewDueAt: "",
  validUntil: "",
  notes: "",
};

export function KnowledgeSourceManager({ sources }: { sources: SourceRow[] }) {
  const { mutate, isPending } = useAdminMutation();
  const [draft, setDraft] = useState(emptyDraft);

  function update(field: keyof typeof emptyDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({
      key: "knowledge-source:create",
      pendingMessage: "正在登记来源...",
      action: () =>
        createKnowledgeSource({
          ...draft,
          reviewDueAt: draft.reviewDueAt || null,
          validUntil: draft.validUntil || null,
        }),
      errorTitle: "来源登记失败",
      errorSuggestion: "请确认 URL、内容 hash 和来源等级完整。",
      onSuccess: () => setDraft(emptyDraft),
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.8fr)]">
      <form onSubmit={submit} className="space-y-4 rounded-md border border-border/70 p-4">
        <div className="flex items-center gap-2">
          <FilePlus2 className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">登记来源</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="sourceKey">
            <Input value={draft.sourceKey} onChange={(event) => update("sourceKey", event.target.value)} required />
          </Field>
          <Field label="来源类型">
            <Input value={draft.kind} onChange={(event) => update("kind", event.target.value)} required />
          </Field>
          <Field label="权威等级">
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.authorityTier}
              onChange={(event) => update("authorityTier", event.target.value)}
            >
              <option value="A">A · 规范 / 官方</option>
              <option value="B">B · 实测 / 运营资料</option>
              <option value="C">C · 发现线索</option>
            </select>
          </Field>
          <Field label="发布者">
            <Input value={draft.publisher} onChange={(event) => update("publisher", event.target.value)} required />
          </Field>
        </div>
        <Field label="标题">
          <Input value={draft.title} onChange={(event) => update("title", event.target.value)} required />
        </Field>
        <Field label="规范 URL">
          <Input type="url" value={draft.canonicalUrl} onChange={(event) => update("canonicalUrl", event.target.value)} required />
        </Field>
        <Field label="内容 hash">
          <Input value={draft.contentHash} onChange={(event) => update("contentHash", event.target.value)} placeholder="sha256:..." required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="复核日期">
            <Input type="date" value={draft.reviewDueAt} onChange={(event) => update("reviewDueAt", event.target.value)} />
          </Field>
          <Field label="有效期">
            <Input type="date" value={draft.validUntil} onChange={(event) => update("validUntil", event.target.value)} />
          </Field>
        </div>
        <Field label="变更原因">
          <Textarea value={draft.changeReason} onChange={(event) => update("changeReason", event.target.value)} rows={2} />
        </Field>
        <Field label="备注">
          <Textarea value={draft.notes} onChange={(event) => update("notes", event.target.value)} rows={2} />
        </Field>
        <Button type="submit" disabled={isPending("knowledge-source:create")}>
          <Save className="size-4" />
          登记来源与首个 revision
        </Button>
      </form>

      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">来源 revision 规则</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            历史 revision 不可覆盖；同一来源的更新必须新建 revision，并在文章或规则发布前绑定引用。
          </p>
        </div>
        <div className="max-h-[620px] overflow-auto rounded-md border border-border/70">
          {sources.map((source) => (
            <div key={source.id} className="border-b border-border/60 p-3 last:border-b-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{source.title ?? source.sourceKey}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {source.sourceKey} · {source.authorityTier} · r{source.revision ?? "-"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{source.status}</span>
              </div>
              {source.canonicalUrl ? (
                <a className="mt-2 block break-all text-xs text-primary hover:underline" href={source.canonicalUrl} target="_blank" rel="noreferrer">
                  {source.canonicalUrl}
                </a>
              ) : null}
            </div>
          ))}
          {sources.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">暂无来源。</p> : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
