import { notFound } from "next/navigation";

import {
  KNOWLEDGE_INDEX_BUILD_PLACEHOLDER,
  KNOWLEDGE_INDEX_VARIANT,
  type KnowledgeIndexLanguage,
} from "@fwqgo/core/knowledge-index";
import {
  getKnowledgeIndexMetadata,
  KnowledgeLandingPage,
} from "@/features/public/routes/knowledge/page";
import { listPublishedKnowledgeArticles } from "@/features/public/data/knowledge";

export type KnowledgeIndexRenderParams = Promise<{ variant: string }>;

/** A real empty index must never be baked into an offline/CI build. */
export function generateStaticParams() {
  return [{ variant: KNOWLEDGE_INDEX_BUILD_PLACEHOLDER }];
}

export async function getKnowledgeIndexRenderMetadata(
  language: KnowledgeIndexLanguage,
  params: KnowledgeIndexRenderParams,
) {
  const { variant } = await params;
  if (variant !== KNOWLEDGE_INDEX_VARIANT) {
    return { robots: { index: false, follow: false } };
  }
  // htmlLimitedBots blocks the initial head on this lookup. A failed core read
  // must become an HTTP error before any successful PPR shell can be flushed.
  // The page reuses these tagged entries instead of repeating the database work.
  await listPublishedKnowledgeArticles({ language });
  return getKnowledgeIndexMetadata(language);
}

export function generateMetadata({
  params,
}: {
  params: KnowledgeIndexRenderParams;
}) {
  return getKnowledgeIndexRenderMetadata("zh", params);
}

export async function KnowledgeIndexRenderPage({
  language,
  params,
}: {
  language: KnowledgeIndexLanguage;
  params: KnowledgeIndexRenderParams;
}) {
  const { variant } = await params;
  if (variant !== KNOWLEDGE_INDEX_VARIANT) notFound();
  return <KnowledgeLandingPage language={language} />;
}

export default function ChineseKnowledgeIndexRender({
  params,
}: {
  params: KnowledgeIndexRenderParams;
}) {
  return <KnowledgeIndexRenderPage language="zh" params={params} />;
}
