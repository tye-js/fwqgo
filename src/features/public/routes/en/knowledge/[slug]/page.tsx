import {
  buildKnowledgeArticleMetadata,
  KnowledgeArticlePage,
} from "@/features/public/routes/knowledge/[slug]/page";

export function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  return buildKnowledgeArticleMetadata("en", props.params);
}

export default function EnglishKnowledgeArticlePage(props: {
  params: Promise<{ slug: string }>;
}) {
  return <KnowledgeArticlePage language="en" params={props.params} />;
}
